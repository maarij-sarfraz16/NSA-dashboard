import "server-only";

import { cache } from "react";
import { addDays, companyFilter, isYmd } from "@/lib/erp/context";
import { getList, groupBy, num, str, type Filter } from "@/lib/erp/query";

/** Stock Entry type the plant uses to book finished pipes / sheets (DPR/... references). */
export const PRODUCTION_ENTRY_TYPE = "Daily Production";
/** Item groups (and every group below them) that make up each part of the report. */
const PIPE_ROOT = "RCC PIPE";
const SHEET_ROOT = "GEOMEMBRANE SHEET";
const RAW_ROOT = "PLF RAW MATERIAL";

/** The day the report covers: ?date=YYYY-MM-DD, never in the future, yesterday by default. */
export function resolveReportDate(requested: string | undefined, today: string): string {
  const yesterday = addDays(today, -1);
  if (!isYmd(requested)) return yesterday;
  return requested > today ? today : requested;
}

type ItemInfo = { code: string; name: string; group: string; uom: string };
type Catalog = { pipes: Map<string, ItemInfo>; sheets: Map<string, ItemInfo>; raw: Map<string, ItemInfo> };

/** `root` plus every item group below it. */
function groupTree(parents: Map<string, string | null>, root: string): string[] {
  const out = [root];
  for (let i = 0; i < out.length; i++) {
    for (const [name, parent] of parents) if (parent === out[i] && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Items of the three reporting groups, classified through the ERPNext item group tree. */
const getCatalog = cache(async (): Promise<Catalog> => {
  const groups = await getList("Item Group", { fields: ["name", "parent_item_group"], limit: 0 }, "item groups");
  const parents = new Map(groups.map((g) => [str(g.name) ?? "", str(g.parent_item_group)]));
  const trees = {
    pipes: groupTree(parents, PIPE_ROOT),
    sheets: groupTree(parents, SHEET_ROOT),
    raw: groupTree(parents, RAW_ROOT),
  };
  const all = [...trees.pipes, ...trees.sheets, ...trees.raw];
  const items = await getList(
    "Item",
    { fields: ["name", "item_name", "item_group", "stock_uom"], filters: [["item_group", "in", all]], orderBy: "name asc", limit: 0 },
    "production items",
  );
  const catalog: Catalog = { pipes: new Map(), sheets: new Map(), raw: new Map() };
  for (const r of items) {
    const group = str(r.item_group) ?? "";
    const info: ItemInfo = {
      code: str(r.name) ?? "",
      name: str(r.item_name) ?? str(r.name) ?? "",
      group,
      uom: str(r.stock_uom) ?? "",
    };
    const bucket = trees.pipes.includes(group) ? "pipes" : trees.sheets.includes(group) ? "sheets" : "raw";
    catalog[bucket].set(info.code, info);
  }
  return catalog;
});

type LedgerRow = { voucher: string; item: string; qty: number; value: number };

/** Stock ledger lines for one day (cancelled entries excluded), restricted to a set of items. */
async function ledger(company: string, date: string, items: string[], extra: Filter[], what: string): Promise<LedgerRow[]> {
  if (items.length === 0) return [];
  const rows = await getList(
    "Stock Ledger Entry",
    {
      fields: ["voucher_no", "item_code", "actual_qty", "stock_value_difference"],
      filters: [
        companyFilter(company),
        ["posting_date", "=", date],
        ["is_cancelled", "=", 0],
        ["item_code", "in", items],
        ...extra,
      ],
      orderBy: "voucher_no asc",
      limit: 0,
    },
    what,
  );
  return rows.map((r) => ({
    voucher: str(r.voucher_no) ?? "",
    item: str(r.item_code) ?? "",
    qty: num(r.actual_qty) ?? 0,
    value: num(r.stock_value_difference) ?? 0,
  }));
}

export type ProducedItem = { code: string; name: string; uom: string; qty: number; value: number };
export type ProductionDay = {
  date: string;
  /** Daily Production entries booked for the day (all products). */
  entries: string[];
  pipes: ProducedItem[];
  sheets: ProducedItem[];
};

function sumBy(rows: LedgerRow[], catalog: Map<string, ItemInfo>, sign: 1 | -1) {
  const acc = new Map<string, { qty: number; value: number; vouchers: Set<string> }>();
  for (const r of rows) {
    if (!catalog.has(r.item)) continue;
    const cur = acc.get(r.item) ?? { qty: 0, value: 0, vouchers: new Set<string>() };
    cur.qty += sign * r.qty;
    cur.value += sign * r.value;
    cur.vouchers.add(r.voucher);
    acc.set(r.item, cur);
  }
  return acc;
}

export const getProductionDay = cache(async function getProductionDay(company: string, date: string): Promise<ProductionDay> {
  const [catalog, entryRows] = await Promise.all([
    getCatalog(),
    getList(
      "Stock Entry",
      {
        fields: ["name"],
        filters: [
          companyFilter(company),
          ["stock_entry_type", "=", PRODUCTION_ENTRY_TYPE],
          ["posting_date", "=", date],
          ["docstatus", "=", 1],
        ],
        orderBy: "name asc",
        limit: 0,
      },
      "daily production entries",
    ),
  ]);
  const entries = entryRows.map((r) => str(r.name) ?? "").filter(Boolean);

  const finished = [...catalog.pipes.keys(), ...catalog.sheets.keys()];
  const rows = entries.length
    ? (await ledger(company, date, finished, [["voucher_type", "=", "Stock Entry"], ["voucher_no", "in", entries], ["actual_qty", ">", 0]], "production stock lines"))
    : [];

  const build = (catalogPart: Map<string, ItemInfo>): ProducedItem[] =>
    [...sumBy(rows, catalogPart, 1)].map(([code, v]) => {
      const info = catalogPart.get(code)!;
      return { code, name: info.name, uom: info.uom, qty: v.qty, value: v.value };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return { date, entries, pipes: build(catalog.pipes), sheets: build(catalog.sheets) };
});

export type PurchasedItem = { code: string; name: string; group: string; uom: string; qty: number; value: number; receipts: string[] };

/** Raw material received into stock on the day through GRNs (goods received notes). */
export const getRawMaterialPurchases = cache(async function getRawMaterialPurchases(company: string, date: string): Promise<PurchasedItem[]> {
  const catalog = await getCatalog();
  const rows = await ledger(company, date, [...catalog.raw.keys()], [["voucher_type", "=", "GRN"], ["actual_qty", ">", 0]], "raw material purchases");
  return [...sumBy(rows, catalog.raw, 1)]
    .map(([code, v]) => {
      const info = catalog.raw.get(code)!;
      return { code, name: info.name, group: info.group, uom: info.uom, qty: v.qty, value: v.value, receipts: [...v.vouchers] };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
});

export type RawMaterialRow = {
  code: string;
  name: string;
  group: string;
  uom: string;
  consumed: number;
  consumedValue: number;
  /** Quantity on hand across all warehouses at the end of the day. */
  onHand: number;
};

/** Every raw material with what was drawn from stores on the day and what was left at the end of it. */
export const getDailyConsumption = cache(async function getDailyConsumption(company: string, date: string): Promise<RawMaterialRow[]> {
  const catalog = await getCatalog();
  const codes = [...catalog.raw.keys()];
  if (codes.length === 0) return [];
  const [issued, stock] = await Promise.all([
    ledger(company, date, codes, [["voucher_type", "=", "Stock Entry"], ["actual_qty", "<", 0]], "raw material consumption"),
    groupBy(
      "Stock Ledger Entry",
      "item_code",
      { qty: "sum(actual_qty)" },
      [companyFilter(company), ["is_cancelled", "=", 0], ["posting_date", "<=", date], ["item_code", "in", codes]],
      { what: "raw material stock" },
    ),
  ]);
  const consumed = sumBy(issued, catalog.raw, -1);
  const onHand = new Map(stock.map((s) => [s.key ?? "", s.qty]));
  return codes
    .map((code) => {
      const info = catalog.raw.get(code)!;
      const c = consumed.get(code);
      return {
        code,
        name: info.name,
        group: info.group,
        uom: info.uom,
        consumed: c?.qty ?? 0,
        consumedValue: c?.value ?? 0,
        onHand: onHand.get(code) ?? 0,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name, undefined, { numeric: true }));
});
