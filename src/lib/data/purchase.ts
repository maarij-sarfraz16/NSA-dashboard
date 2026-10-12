import "server-only";

import { cache } from "react";
import { addDays, lastMonths, companyFilter } from "@/lib/erp/context";
import { aggregate, count, getList, groupBy, num, searchFilters, str, type Filter } from "@/lib/erp/query";
import type { Period } from "@/lib/period";
import { monthlySums } from "./scope";
import { lookupNames, outstandingByCurrency, PAGE_SIZE, type CurrencyAmount, type Page, type Ranked } from "./shared";
import type { Totals } from "./sales";

const between = (field: string, from: string, to: string): Filter => [field, "between", [from, to]];

async function poBooked(company: string, from: string, to: string): Promise<Totals> {
  const r = await aggregate(
    "Purchase Order",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("transaction_date", from, to)],
    "purchase orders",
  );
  return { total: r.total, count: r.count };
}

async function purchaseInvoiced(company: string, from: string, to: string): Promise<Totals> {
  const r = await aggregate(
    "Purchase Invoice",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("posting_date", from, to)],
    "purchase invoices",
  );
  return { total: r.total, count: r.count };
}

export const getPurchaseSummary = cache(async function getPurchaseSummary(company: string, period: Period, today: string) {
  const base: Filter[] = [companyFilter(company)];
  const [ordered, previousOrdered, invoiced, payables, overdue, toReceive] = await Promise.all([
    poBooked(company, period.from, period.to),
    period.previous ? poBooked(company, period.previous.from, period.previous.to) : Promise.resolve(null),
    purchaseInvoiced(company, period.from, period.to),
    outstandingByCurrency("Purchase Invoice", base, "payables"),
    outstandingByCurrency(
      "Purchase Invoice",
      [...base, ["due_date", "<", today], ["outstanding_amount", ">", 0]],
      "overdue payables",
    ),
    count(
      "Purchase Order",
      [...base, ["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]]],
      "purchase orders awaiting receipt",
    ),
  ]);
  return { ordered, previousOrdered, invoiced, payables, overdue, toReceive };
});

/** Local vs Import split, from the `purchase_type` field added by the nsa_import app. */
export async function getPurchaseTypeSplit(company: string, period: Period) {
  const rows = await groupBy(
    "Purchase Order",
    "purchase_type",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("transaction_date", period.from, period.to)],
    { what: "purchase type split" },
  );
  return rows.map((r) => ({ type: r.key ?? "Not set", total: r.total, count: r.count }));
}

/** Purchase invoiced per month, company currency. */
export const getPurchaseTrend = cache(async function getPurchaseTrend(company: string, today: string, months = 12) {
  const keys = lastMonths(today, months);
  const values = await monthlySums(
    "Purchase Invoice",
    "posting_date",
    "sum(base_grand_total)",
    [companyFilter(company), ["docstatus", "=", 1]],
    keys,
    "monthly purchases",
  );
  return { months: keys, values };
});

export async function getTopSuppliers(company: string, period: Period, limit = 8): Promise<Ranked[]> {
  const rows = await groupBy(
    "Purchase Order",
    "supplier",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("transaction_date", period.from, period.to)],
    { orderBy: "total desc", limit, what: "top suppliers" },
  );
  const names = await lookupNames(
    "Supplier",
    "supplier_name",
    rows.map((r) => r.key).filter((k): k is string => !!k),
  );
  return rows.map((r) => ({
    key: r.key ?? "",
    label: (r.key && names.get(r.key)) || r.key || "Unknown supplier",
    total: r.total,
    count: r.count,
  }));
}

// --- Letters of credit (nsa_import) -----------------------------------------

const LC_ACTIVE = ["Opened", "Amended", "Partially Shipped"];

export type LcRow = {
  name: string;
  lcNo: string | null;
  supplier: string | null;
  bank: string | null;
  currency: string | null;
  amount: number | null;
  balance: number | null;
  expiry: string | null;
  latestShipment: string | null;
  status: string | null;
};

export const getLetterOfCredit = cache(async function getLetterOfCredit(company: string, today: string, withinDays = 30) {
  const base: Filter[] = [companyFilter(company), ["docstatus", "=", 1], ["status", "in", LC_ACTIVE]];
  const [open, expiring] = await Promise.all([
    groupBy("Letter of Credit", "currency", { amount: "sum(balance_amount)", count: "count(name)" }, base, {
      what: "open letters of credit",
    }),
    getList(
      "Letter of Credit",
      {
        fields: ["name", "lc_no", "supplier_name", "issuing_bank", "currency", "lc_amount", "balance_amount",
          "expiry_date", "latest_shipment_date", "status"],
        filters: [...base, ["expiry_date", "between", [today, addDays(today, withinDays)]]],
        orderBy: "expiry_date asc",
        limit: 50,
      },
      "expiring letters of credit",
    ),
  ]);
  const openBalances: CurrencyAmount[] = open.map((r) => ({
    currency: r.key ?? "",
    amount: r.amount,
    count: r.count,
  }));
  const expiringRows: LcRow[] = expiring.map((r) => ({
    name: str(r.name) ?? "",
    lcNo: str(r.lc_no),
    supplier: str(r.supplier_name),
    bank: str(r.issuing_bank),
    currency: str(r.currency),
    amount: num(r.lc_amount),
    balance: num(r.balance_amount),
    expiry: str(r.expiry_date),
    latestShipment: str(r.latest_shipment_date),
    status: str(r.status),
  }));
  return { openBalances, expiring: expiringRows, withinDays };
});

// --- Purchase orders table ---------------------------------------------------

export const PO_OPEN = ["To Receive and Bill", "To Receive", "To Bill"];
export const PO_STATUSES = ["Draft", "On Hold", ...PO_OPEN, "Completed", "Delivered", "Closed", "Cancelled"];

export type PurchaseOrderRow = {
  name: string;
  date: string | null;
  supplier: string | null;
  purchaseType: string | null;
  requiredBy: string | null;
  total: number | null;
  perReceived: number | null;
  perBilled: number | null;
  status: string | null;
  late: boolean;
};

export async function getPurchaseOrders(
  company: string,
  opts: { status?: string; type?: string; q?: string; page: number },
  today: string,
): Promise<Page<PurchaseOrderRow>> {
  const filters: Filter[] = [companyFilter(company)];
  if (!opts.status || opts.status === "open") filters.push(["status", "in", PO_OPEN]);
  else if (opts.status !== "all" && PO_STATUSES.includes(opts.status)) filters.push(["status", "=", opts.status]);
  if (opts.type === "Local" || opts.type === "Import") filters.push(["purchase_type", "=", opts.type]);
  const or = searchFilters(opts.q, ["name", "supplier", "supplier_name"]);

  const [rows, total] = await Promise.all([
    getList(
      "Purchase Order",
      {
        fields: ["name", "transaction_date", "supplier_name", "purchase_type", "schedule_date", "base_grand_total",
          "per_received", "per_billed", "status"],
        filters,
        orFilters: or,
        orderBy: "transaction_date desc, name desc",
        start: (opts.page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "purchase orders",
    ),
    count("Purchase Order", filters, "purchase orders", or),
  ]);

  return {
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => {
      const status = str(r.status);
      const requiredBy = str(r.schedule_date);
      const perReceived = num(r.per_received);
      return {
        name: str(r.name) ?? "",
        date: str(r.transaction_date),
        supplier: str(r.supplier_name),
        purchaseType: str(r.purchase_type),
        requiredBy,
        total: num(r.base_grand_total),
        perReceived,
        perBilled: num(r.per_billed),
        status,
        late:
          !!requiredBy &&
          requiredBy < today &&
          (perReceived ?? 0) < 100 &&
          !!status &&
          ["To Receive and Bill", "To Receive"].includes(status),
      };
    }),
  };
}
