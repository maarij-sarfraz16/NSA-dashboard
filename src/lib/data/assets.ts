import "server-only";

import { cache } from "react";
import { companyFilter } from "@/lib/erp/context";
import { aggregate, count, getList, groupBy, num, searchFilters, str, type Filter } from "@/lib/erp/query";
import { PAGE_SIZE, type Page, type Ranked } from "./shared";

export const ASSET_STATUSES = [
  "Draft",
  "Submitted",
  "Partially Depreciated",
  "Fully Depreciated",
  "Sold",
  "Scrapped",
  "In Maintenance",
  "Out of Order",
  "Issue",
  "Receipt",
  "Capitalized",
  "Work In Progress",
];

/** Statuses of assets that are no longer on the books. */
const RETIRED = ["Sold", "Scrapped"];

const submitted = (company: string): Filter[] => [companyFilter(company), ["docstatus", "=", 1]];
const inUse = (company: string): Filter[] => [...submitted(company), ["status", "not in", RETIRED]];

export const getAssetSummary = cache(async function getAssetSummary(company: string) {
  const [active, retired, maintenance] = await Promise.all([
    aggregate(
      "Asset",
      { count: "count(name)", gross: "sum(purchase_amount)", book: "sum(value_after_depreciation)" },
      inUse(company),
      "asset totals",
    ),
    count("Asset", [...submitted(company), ["status", "in", RETIRED]], "retired assets"),
    count("Asset", [...submitted(company), ["status", "in", ["In Maintenance", "Out of Order"]]], "assets in maintenance"),
  ]);
  return {
    count: active.count,
    gross: active.gross,
    book: active.book,
    depreciated: active.gross - active.book,
    retired,
    maintenance,
  };
});

export async function getAssetsByCategory(company: string, limit = 8): Promise<Ranked[]> {
  const rows = await groupBy(
    "Asset",
    "asset_category",
    { total: "sum(value_after_depreciation)", count: "count(name)" },
    inUse(company),
    { orderBy: "total desc", limit, what: "assets by category" },
  );
  return rows.map((r) => ({ key: r.key ?? "", label: r.key ?? "No category", total: r.total, count: r.count }));
}

export async function getAssetsByStatus(company: string): Promise<Ranked[]> {
  const rows = await groupBy(
    "Asset",
    "status",
    { total: "sum(value_after_depreciation)", count: "count(name)" },
    submitted(company),
    { orderBy: "count desc", what: "assets by status" },
  );
  return rows.map((r) => ({ key: r.key ?? "", label: r.key ?? "No status", total: r.total, count: r.count }));
}

/** Per-company split. Only meaningful for a group company, where it separates Polymer and Polycam. */
export async function getAssetsByCompany(company: string) {
  const rows = await groupBy(
    "Asset",
    "company",
    { gross: "sum(purchase_amount)", book: "sum(value_after_depreciation)", count: "count(name)" },
    inUse(company),
    { orderBy: "book desc", what: "assets by company" },
  );
  return rows.map((r) => ({ company: r.key ?? "", count: r.count, gross: r.gross, book: r.book }));
}

export type AssetRow = {
  name: string;
  assetName: string | null;
  category: string | null;
  company: string | null;
  location: string | null;
  custodian: string | null;
  purchaseDate: string | null;
  gross: number | null;
  book: number | null;
  status: string | null;
};

export async function getAssets(
  company: string,
  opts: { status?: string; category?: string; q?: string; page: number },
): Promise<Page<AssetRow>> {
  const filters: Filter[] = [companyFilter(company), ["docstatus", "<", 2]];
  if (opts.status === "open" || !opts.status) filters.push(["status", "not in", RETIRED]);
  else if (opts.status !== "all") filters.push(["status", "=", opts.status]);
  if (opts.category) filters.push(["asset_category", "=", opts.category]);
  const orFilters = searchFilters(opts.q, ["name", "asset_name", "asset_category", "location", "custodian"]);

  const [total, rows] = await Promise.all([
    count("Asset", filters, "asset count", orFilters),
    getList(
      "Asset",
      {
        fields: ["name", "asset_name", "asset_category", "company", "location", "custodian", "purchase_date",
          "purchase_amount", "value_after_depreciation", "status"],
        filters,
        orFilters,
        orderBy: "purchase_date desc, creation desc",
        start: (opts.page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "assets",
    ),
  ]);
  return {
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({
      name: str(r.name) ?? "",
      assetName: str(r.asset_name),
      category: str(r.asset_category),
      company: str(r.company),
      location: str(r.location),
      custodian: str(r.custodian),
      purchaseDate: str(r.purchase_date),
      gross: num(r.purchase_amount),
      book: num(r.value_after_depreciation),
      status: str(r.status),
    })),
  };
}

export async function getAssetCategories(company: string): Promise<string[]> {
  const rows = await groupBy("Asset", "asset_category", { n: "count(name)" }, [companyFilter(company), ["docstatus", "<", 2]], {
    what: "asset categories",
  });
  return rows.map((r) => r.key).filter((k): k is string => !!k).sort();
}

// --- Maintenance, repairs and movements ----------------------------------------

export type MaintenanceRow = {
  name: string;
  asset: string | null;
  task: string | null;
  dueDate: string | null;
  status: string | null;
  assignedTo: string | null;
};

export const getAssetActivity = cache(async function getAssetActivity(company: string, today: string) {
  const [overdue, repairs, movements, due] = await Promise.all([
    count(
      "Asset Maintenance Log",
      [["due_date", "<", today], ["maintenance_status", "in", ["Planned", "Overdue"]], ["docstatus", "<", 2]],
      "overdue maintenance",
    ),
    aggregate(
      "Asset Repair",
      { count: "count(name)", cost: "sum(total_repair_cost)" },
      [companyFilter(company), ["docstatus", "=", 1]],
      "asset repairs",
    ),
    count("Asset Movement", [companyFilter(company), ["docstatus", "=", 1]], "asset movements"),
    getList(
      "Asset Maintenance Log",
      {
        fields: ["name", "asset_name", "task_name", "due_date", "maintenance_status", "assign_to_name"],
        filters: [["maintenance_status", "in", ["Planned", "Overdue"]], ["docstatus", "<", 2]],
        orderBy: "due_date asc",
        limit: 10,
      },
      "upcoming maintenance",
    ),
  ]);
  const dueRows: MaintenanceRow[] = due.map((r) => ({
    name: str(r.name) ?? "",
    asset: str(r.asset_name),
    task: str(r.task_name),
    dueDate: str(r.due_date),
    status: str(r.maintenance_status),
    assignedTo: str(r.assign_to_name),
  }));
  return { overdue, repairs: repairs.count, repairCost: repairs.cost, movements, due: dueRows };
});

// --- Fixed-asset ledger -----------------------------------------------------------
// Balances on the fixed-asset accounts in the general ledger. This reflects assets
// booked through journals / opening entries even when no Asset record exists yet.

const LEDGER_TYPES = ["Fixed Asset", "Accumulated Depreciation", "Capital Work in Progress"] as const;

export type LedgerRow = { account: string; company: string; type: string; entries: number; balance: number };

export const getFixedAssetLedger = cache(async function getFixedAssetLedger(company: string): Promise<LedgerRow[]> {
  const accounts = await getList(
    "Account",
    {
      fields: ["name", "company", "account_type"],
      filters: [companyFilter(company), ["is_group", "=", 0], ["account_type", "in", [...LEDGER_TYPES]]],
      limit: 0,
    },
    "fixed asset accounts",
  );
  if (accounts.length === 0) return [];
  const meta = new Map(accounts.map((a) => [str(a.name) ?? "", a]));

  const rows = await getList(
    "GL Entry",
    {
      fields: ["account", { SUM: "debit", as: "debit" }, { SUM: "credit", as: "credit" }, { COUNT: "name", as: "entries" }],
      filters: [["is_cancelled", "=", 0], ["account", "in", [...meta.keys()]]],
      groupBy: "account",
      limit: 0,
    },
    "fixed asset ledger",
  );
  return rows
    .map((r) => {
      const a = meta.get(str(r.account) ?? "");
      return {
        account: str(r.account) ?? "",
        company: str(a?.company) ?? "",
        type: str(a?.account_type) ?? "",
        entries: num(r.entries) ?? 0,
        balance: (num(r.debit) ?? 0) - (num(r.credit) ?? 0),
      };
    })
    .filter((r) => r.entries > 0 && r.balance !== 0)
    .sort((a, b) => a.company.localeCompare(b.company) || b.balance - a.balance);
});
