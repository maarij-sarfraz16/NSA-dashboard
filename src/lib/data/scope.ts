import "server-only";

import { cache } from "react";
import { getCompanies, getTimeZone, nowIn, resolveCompany, todayIn, type Company } from "@/lib/erp/context";
import { groupBy, type Filter } from "@/lib/erp/query";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

export function pageParam(sp: SearchParams, key = "page"): number {
  const n = Number(param(sp, key));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** The period selection as URL params, for links that should keep it (pagination, tabs). */
export function periodParams(sp: SearchParams) {
  const period = param(sp, "period");
  return period === "custom"
    ? { period, from: param(sp, "from"), to: param(sp, "to") }
    : { period, from: undefined, to: undefined };
}

export type Scope = {
  company: Company;
  companies: Company[];
  timeZone: string;
  today: string;
  /** Server time in the ERPNext time zone when the data was requested. */
  fetchedAt: string;
  fetchedAtMs: number;
};

/** Company + "today" for this request, resolved against ERPNext (deduplicated per request). */
export const getScope = cache(async (companyParam: string | undefined): Promise<Scope> => {
  const [companies, timeZone, company] = await Promise.all([
    getCompanies(),
    getTimeZone(),
    resolveCompany(companyParam),
  ]);
  const now = new Date();
  return {
    company,
    companies,
    timeZone,
    today: todayIn(timeZone, now),
    fetchedAt: nowIn(timeZone, now),
    fetchedAtMs: now.getTime(),
  };
});

/**
 * Sums `expr` per calendar month over `months` ("YYYY-MM" keys). Groups by the raw
 * Date column (at most one row per day) and buckets in code, so no SQL date
 * functions are needed.
 */
export async function monthlySums(
  doctype: string,
  dateField: string,
  expr: string,
  filters: Filter[],
  months: string[],
  what: string,
): Promise<number[]> {
  const from = `${months[0]}-01`;
  const rows = await groupBy(
    doctype,
    dateField,
    { v: expr },
    [...filters, [dateField, ">=", from]],
    { what },
  );
  const totals = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    const key = r.key?.slice(0, 7);
    if (key && totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + r.v);
  }
  return months.map((m) => totals.get(m) ?? 0);
}
