import "server-only";

import { cache } from "react";
import { addMonths, lastMonths, monthEnd, companyFilter } from "@/lib/erp/context";
import { count, getList, groupBy, num, searchFilters, str, type Filter } from "@/lib/erp/query";
import type { Period } from "@/lib/period";
import { PAGE_SIZE, type Page } from "./shared";

export const WO_ACTIVE = ["Not Started", "In Process"];
export const WO_STATUSES = ["Draft", "Not Started", "In Process", "Stopped", "Completed", "Closed", "Cancelled"];

/** Datetime bounds covering whole days (ERPNext stores datetimes in the system time zone). */
const dayRange = (from: string, to: string): [string, string] => [`${from} 00:00:00`, `${to} 23:59:59`];

export const getManufacturingSummary = cache(async function getManufacturingSummary(company: string, period: Period, now: string) {
  const base: Filter[] = [companyFilter(company)];
  const [byStatus, completed, overdue] = await Promise.all([
    groupBy("Work Order", "status", { n: "count(name)" }, [...base, ["docstatus", "<", 2]], {
      what: "work orders by status",
    }),
    count(
      "Work Order",
      [...base, ["status", "=", "Completed"], ["actual_end_date", "between", dayRange(period.from, period.to)]],
      "completed work orders",
    ),
    count(
      "Work Order",
      [...base, ["status", "in", WO_ACTIVE], ["planned_end_date", "<", now]],
      "overdue work orders",
    ),
  ]);
  const statusCounts = Object.fromEntries(byStatus.map((r) => [r.key ?? "Unknown", r.n])) as Record<string, number>;
  return { statusCounts, completedInPeriod: completed, overdue };
});

/** Work orders completed per month (by actual end date). */
export async function getCompletionTrend(company: string, today: string, months = 12) {
  const keys = lastMonths(today, months);
  // actual_end_date is a Datetime, so count per month range rather than grouping by day
  const values = await Promise.all(
    keys.map((key) => {
      const from = `${key}-01`;
      return count(
        "Work Order",
        [
          companyFilter(company),
          ["status", "=", "Completed"],
          ["actual_end_date", "between", dayRange(from, monthEnd(from))],
        ],
        "monthly completed work orders",
      );
    }),
  );
  return { months: keys, values, since: addMonths(today, -(months - 1)) };
}

export type WorkOrderRow = {
  name: string;
  item: string | null;
  itemName: string | null;
  qty: number | null;
  produced: number | null;
  uom: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  salesOrder: string | null;
  status: string | null;
  overdue: boolean;
};

export async function getWorkOrders(
  company: string,
  opts: { status?: string; q?: string; page: number },
  now: string,
): Promise<Page<WorkOrderRow>> {
  const filters: Filter[] = [companyFilter(company)];
  if (!opts.status || opts.status === "active") filters.push(["status", "in", WO_ACTIVE]);
  else if (opts.status === "overdue") filters.push(["status", "in", WO_ACTIVE], ["planned_end_date", "<", now]);
  else if (opts.status !== "all" && WO_STATUSES.includes(opts.status)) filters.push(["status", "=", opts.status]);
  const or = searchFilters(opts.q, ["name", "production_item", "item_name", "sales_order"]);

  const [rows, total] = await Promise.all([
    getList(
      "Work Order",
      {
        fields: ["name", "production_item", "item_name", "qty", "produced_qty", "stock_uom", "planned_start_date",
          "planned_end_date", "sales_order", "status"],
        filters,
        orFilters: or,
        orderBy: "planned_end_date asc, name asc",
        start: (opts.page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "work orders",
    ),
    count("Work Order", filters, "work orders", or),
  ]);

  return {
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => {
      const status = str(r.status);
      const plannedEnd = str(r.planned_end_date);
      return {
        name: str(r.name) ?? "",
        item: str(r.production_item),
        itemName: str(r.item_name),
        qty: num(r.qty),
        produced: num(r.produced_qty),
        uom: str(r.stock_uom),
        plannedStart: str(r.planned_start_date),
        plannedEnd,
        salesOrder: str(r.sales_order),
        status,
        overdue: !!plannedEnd && plannedEnd < now && !!status && WO_ACTIVE.includes(status),
      };
    }),
  };
}
