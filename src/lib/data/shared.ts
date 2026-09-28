import "server-only";

import { toErrorInfo, type ErrorInfo } from "@/lib/erp/errors";
import { getList, groupBy, str, type Filter } from "@/lib/erp/query";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

/** Runs a loader and captures failures so one broken section never blanks the whole page. */
export async function attempt<T>(load: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    console.error("[erp]", err);
    return { ok: false, error: toErrorInfo(err) };
  }
}

export type CurrencyAmount = { currency: string; amount: number; count: number };

/**
 * Outstanding balances grouped by party account currency. ERPNext stores
 * `outstanding_amount` in the party account's currency, so amounts in different
 * currencies are reported separately rather than added together.
 */
export async function outstandingByCurrency(
  doctype: "Sales Invoice" | "Purchase Invoice",
  filters: Filter[],
  what: string,
): Promise<CurrencyAmount[]> {
  const rows = await groupBy(
    doctype,
    "party_account_currency",
    { amount: "sum(outstanding_amount)", count: "count(name)" },
    [...filters, ["docstatus", "=", 1], ["outstanding_amount", "!=", 0]],
    { what },
  );
  return rows
    .filter((r) => r.amount !== 0)
    .map((r) => ({ currency: r.key ?? "", amount: r.amount, count: r.count }))
    .sort((a, b) => b.amount - a.amount);
}

/** Separates the company-currency balance from balances held in other currencies. */
export function splitByCurrency(list: CurrencyAmount[], currency: string) {
  const main = list.find((c) => c.currency === currency) ?? { currency, amount: 0, count: 0 };
  return { main, others: list.filter((c) => c.currency !== currency) };
}

/** Looks up display names for link values, e.g. Customer -> customer_name. */
export async function lookupNames(
  doctype: string,
  nameField: string,
  names: string[],
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const rows = await getList(
    doctype,
    { fields: ["name", nameField], filters: [["name", "in", names]], limit: 0 },
    `${doctype} names`,
  );
  return new Map(rows.map((r) => [str(r.name) ?? "", str(r[nameField]) ?? str(r.name) ?? ""]));
}

export type Ranked = { key: string; label: string; total: number; count: number };

export const PAGE_SIZE = 20;

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
