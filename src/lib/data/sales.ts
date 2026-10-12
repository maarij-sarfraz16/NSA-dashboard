import "server-only";

import { cache } from "react";
import { lastMonths, companyFilter } from "@/lib/erp/context";
import { aggregate, bool, count, getList, groupBy, num, searchFilters, str, type Filter } from "@/lib/erp/query";
import type { Period } from "@/lib/period";
import { monthlySums } from "./scope";
import { lookupNames, outstandingByCurrency, PAGE_SIZE, type Page, type Ranked } from "./shared";

const between = (field: string, from: string, to: string): Filter => [field, "between", [from, to]];

export type Totals = { total: number; count: number };

async function invoiced(company: string, from: string, to: string): Promise<Totals> {
  const r = await aggregate(
    "Sales Invoice",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("posting_date", from, to)],
    "sales invoices",
  );
  return { total: r.total, count: r.count };
}

async function ordersBooked(company: string, from: string, to: string): Promise<Totals> {
  const r = await aggregate(
    "Sales Order",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("transaction_date", from, to)],
    "sales orders",
  );
  return { total: r.total, count: r.count };
}

export const getSalesSummary = cache(async function getSalesSummary(company: string, period: Period, today: string) {
  const base: Filter[] = [companyFilter(company)];
  const [current, previous, orders, receivables, overdue] = await Promise.all([
    invoiced(company, period.from, period.to),
    period.previous ? invoiced(company, period.previous.from, period.previous.to) : Promise.resolve(null),
    ordersBooked(company, period.from, period.to),
    outstandingByCurrency("Sales Invoice", base, "receivables"),
    outstandingByCurrency(
      "Sales Invoice",
      [...base, ["due_date", "<", today], ["outstanding_amount", ">", 0]],
      "overdue receivables",
    ),
  ]);
  return { invoiced: current, previousInvoiced: previous, orders, receivables, overdue };
});

/** Net invoiced (returns included, as negative invoices) per month, company currency. */
export const getSalesTrend = cache(async function getSalesTrend(company: string, today: string, months = 12) {
  const keys = lastMonths(today, months);
  const values = await monthlySums(
    "Sales Invoice",
    "posting_date",
    "sum(base_grand_total)",
    [companyFilter(company), ["docstatus", "=", 1]],
    keys,
    "monthly sales",
  );
  return { months: keys, values };
});

export async function getTopCustomers(company: string, period: Period, limit = 8): Promise<Ranked[]> {
  const rows = await groupBy(
    "Sales Invoice",
    "customer",
    { total: "sum(base_grand_total)", count: "count(name)" },
    [companyFilter(company), ["docstatus", "=", 1], between("posting_date", period.from, period.to)],
    { orderBy: "total desc", limit, what: "top customers" },
  );
  const names = await lookupNames(
    "Customer",
    "customer_name",
    rows.map((r) => r.key).filter((k): k is string => !!k),
  );
  return rows.map((r) => ({
    key: r.key ?? "",
    label: (r.key && names.get(r.key)) || r.key || "Unknown customer",
    total: r.total,
    count: r.count,
  }));
}

// --- Sales orders table ------------------------------------------------------

export const SO_OPEN = ["To Deliver and Bill", "To Deliver", "To Bill"];
export const SO_STATUSES = ["Draft", "On Hold", ...SO_OPEN, "Completed", "Closed", "Cancelled"];

export type SalesOrderRow = {
  name: string;
  date: string | null;
  customer: string | null;
  deliveryDate: string | null;
  total: number | null;
  perDelivered: number | null;
  perBilled: number | null;
  status: string | null;
  late: boolean;
};

export async function getSalesOrders(
  company: string,
  opts: { status?: string; q?: string; page: number },
  today: string,
): Promise<Page<SalesOrderRow>> {
  const filters: Filter[] = [companyFilter(company)];
  if (!opts.status || opts.status === "open") filters.push(["status", "in", SO_OPEN]);
  else if (opts.status !== "all" && SO_STATUSES.includes(opts.status)) filters.push(["status", "=", opts.status]);
  const or = searchFilters(opts.q, ["name", "customer", "customer_name"]);

  const [rows, total] = await Promise.all([
    getList(
      "Sales Order",
      {
        fields: ["name", "transaction_date", "customer_name", "delivery_date", "base_grand_total",
          "per_delivered", "per_billed", "status"],
        filters,
        orFilters: or,
        orderBy: "transaction_date desc, name desc",
        start: (opts.page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "sales orders",
    ),
    count("Sales Order", filters, "sales orders", or),
  ]);

  return {
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => {
      const status = str(r.status);
      const deliveryDate = str(r.delivery_date);
      const perDelivered = num(r.per_delivered);
      return {
        name: str(r.name) ?? "",
        date: str(r.transaction_date),
        customer: str(r.customer_name),
        deliveryDate,
        total: num(r.base_grand_total),
        perDelivered,
        perBilled: num(r.per_billed),
        status,
        late:
          !!deliveryDate &&
          deliveryDate < today &&
          (perDelivered ?? 0) < 100 &&
          !!status &&
          ["To Deliver and Bill", "To Deliver"].includes(status),
      };
    }),
  };
}

// --- Sales invoices table ----------------------------------------------------

export const SI_STATUSES = ["Unpaid", "Overdue", "Partly Paid", "Paid", "Return", "Credit Note Issued", "Draft"];

export type SalesInvoiceRow = {
  name: string;
  date: string | null;
  customer: string | null;
  dueDate: string | null;
  total: number | null;
  outstanding: number | null;
  currency: string | null;
  status: string | null;
  isReturn: boolean;
};

export async function getSalesInvoices(
  company: string,
  opts: { status?: string; q?: string; page: number },
): Promise<Page<SalesInvoiceRow>> {
  const filters: Filter[] = [companyFilter(company), ["docstatus", "<", 2]];
  if (!opts.status || opts.status === "unpaid") filters.push(["outstanding_amount", ">", 0], ["docstatus", "=", 1]);
  else if (opts.status !== "all" && SI_STATUSES.includes(opts.status)) filters.push(["status", "=", opts.status]);
  const or = searchFilters(opts.q, ["name", "customer", "customer_name"]);

  const [rows, total] = await Promise.all([
    getList(
      "Sales Invoice",
      {
        fields: ["name", "posting_date", "customer_name", "due_date", "base_grand_total", "outstanding_amount",
          "party_account_currency", "status", "is_return"],
        filters,
        orFilters: or,
        orderBy: "posting_date desc, name desc",
        start: (opts.page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "sales invoices",
    ),
    count("Sales Invoice", filters, "sales invoices", or),
  ]);

  return {
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({
      name: str(r.name) ?? "",
      date: str(r.posting_date),
      customer: str(r.customer_name),
      dueDate: str(r.due_date),
      total: num(r.base_grand_total),
      outstanding: num(r.outstanding_amount),
      currency: str(r.party_account_currency),
      status: str(r.status),
      isReturn: bool(r.is_return),
    })),
  };
}
