import "server-only";

import { cache } from "react";
import { getConfig } from "@/lib/env";
import { callMethod } from "./client";
import { ErpError } from "./errors";
import { getList, str } from "./query";

export type Company = {
  name: string;
  abbr: string | null;
  currency: string;
  isGroup: boolean;
  parent: string | null;
};

/**
 * Group company -> all companies rolled up into it (itself plus every descendant).
 * Filled by getCompanies(), which every request runs (via getScope) before any data query.
 */
const groupMembers = new Map<string, string[]>();

/**
 * Filter selecting a company's documents. A group company (e.g. NSA Group) selects
 * its own documents plus those of all its subsidiaries, so figures are combined.
 */
export function companyFilter(company: string): [string, string, string | string[]] {
  const members = groupMembers.get(company);
  return members && members.length > 1 ? ["company", "in", members] : ["company", "=", company];
}

/** Companies visible to the service user (deduplicated per request). */
export const getCompanies = cache(async (): Promise<Company[]> => {
  const rows = await getList(
    "Company",
    { fields: ["name", "abbr", "default_currency", "is_group", "parent_company"], orderBy: "name asc", limit: 0 },
    "companies",
  );
  const companies = rows
    .map((r) => ({
      name: str(r.name) ?? "",
      abbr: str(r.abbr),
      currency: str(r.default_currency) ?? "",
      isGroup: Number(r.is_group) === 1,
      parent: str(r.parent_company),
    }))
    .filter((c) => c.name);

  groupMembers.clear();
  for (const c of companies) {
    if (!c.isGroup) continue;
    const members = [c.name];
    for (let i = 0; i < members.length; i++) {
      for (const child of companies) {
        if (child.parent === members[i] && !members.includes(child.name)) members.push(child.name);
      }
    }
    groupMembers.set(c.name, members);
  }
  return companies;
});

/** ERPNext system time zone; "today" on the dashboard means today in this zone. */
export const getTimeZone = cache(async (): Promise<string> => {
  const result = await callMethod<{ time_zone?: string } | null>(
    "frappe.client.get_time_zone",
    {},
    "system time zone",
  );
  const tz = result?.time_zone;
  if (!tz) throw new ErpError("bad_response", "ERPNext did not return a system time zone.");
  return tz;
});

/**
 * Resolves the company from the URL (?company=) against the real company list.
 * Unknown names fall back to ERP_DEFAULT_COMPANY, then to the top-level group
 * company (NSA Group), then to the first company.
 */
export async function resolveCompany(requested: string | undefined): Promise<Company> {
  const companies = await getCompanies();
  if (companies.length === 0) {
    throw new ErpError(
      "forbidden",
      "The ERPNext service user cannot see any Company. Give it read access to Company.",
    );
  }
  const fallback = getConfig().defaultCompany;
  return (
    companies.find((c) => c.name === requested) ??
    companies.find((c) => c.name === fallback) ??
    companies.find((c) => c.isGroup && !c.parent) ??
    companies[0]
  );
}

// --- dates (ERPNext stores dates as YYYY-MM-DD in the system time zone) ------

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function nowIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  return `${todayIn(timeZone, now)} ${parts}`;
}

type YMD = { y: number; m: number; d: number };

export function parseYmd(s: string): YMD {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ymd(y: number, m: number, d: number): string {
  // normalise overflow (e.g. month 13, day 0) through UTC date maths
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(s: string, days: number): string {
  const { y, m, d } = parseYmd(s);
  return ymd(y, m, d + days);
}

export function monthStart(s: string): string {
  const { y, m } = parseYmd(s);
  return ymd(y, m, 1);
}

export function monthEnd(s: string): string {
  const { y, m } = parseYmd(s);
  return ymd(y, m + 1, 0);
}

export function addMonths(s: string, months: number): string {
  const { y, m } = parseYmd(s);
  return ymd(y, m + months, 1);
}

export function daysBetween(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** "YYYY-MM" keys for the `count` months ending with the month containing `today`. */
export function lastMonths(today: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(addMonths(today, -i).slice(0, 7));
  return keys;
}

export const isYmd = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
