import "server-only";

import { callMethod } from "./client";
import { ErpError } from "./errors";

export type FilterValue = string | number | null | (string | number)[];
export type Filter = [field: string, operator: string, value: FilterValue];

/** A column name, or an aggregate in Frappe's dict syntax, e.g. `{ SUM: "base_grand_total", as: "total" }`. */
export type Field = string | Record<string, string>;

export type ListArgs = {
  fields: Field[];
  filters?: Filter[];
  orFilters?: Filter[];
  groupBy?: string;
  orderBy?: string;
  start?: number;
  /** 0 means "no limit" in Frappe. Defaults to 20. */
  limit?: number;
};

export type Row = Record<string, unknown>;

/**
 * `frappe.client.get_list` - honours the service user's ERPNext permissions and
 * supports aggregates (see `aggField`) plus `group_by`. `orderBy` must reference
 * aggregates by alias, not by expression.
 */
export async function getList(doctype: string, args: ListArgs, what = doctype): Promise<Row[]> {
  const rows = await callMethod<unknown>(
    "frappe.client.get_list",
    {
      doctype,
      fields: args.fields,
      filters: args.filters,
      or_filters: args.orFilters?.length ? args.orFilters : undefined,
      group_by: args.groupBy,
      order_by: args.orderBy,
      limit_start: args.start ?? 0,
      limit_page_length: args.limit ?? 20,
    },
    what,
  );
  if (!Array.isArray(rows)) {
    throw new ErpError("bad_response", `Expected a list of ${what} records from ERPNext.`);
  }
  return rows as Row[];
}

/**
 * Turns `sum(base_grand_total)` + alias into `{ SUM: "base_grand_total", as: alias }`.
 * Newer Frappe v15 rejects SQL functions written as strings in `fields`.
 */
export function aggField(expr: string, alias: string): Field {
  const m = /^\s*(sum|count|avg|min|max)\s*\(\s*([\w*]+)\s*\)\s*$/i.exec(expr);
  if (!m) throw new Error(`Unsupported aggregate expression: ${expr}`);
  return { [m[1].toUpperCase()]: m[2], as: alias };
}

/** Single-row aggregate, e.g. `{ total: "sum(base_grand_total)", n: "count(name)" }`. */
export async function aggregate<K extends string>(
  doctype: string,
  exprs: Record<K, string>,
  filters: Filter[],
  what = doctype,
  orFilters?: Filter[],
): Promise<Record<K, number>> {
  const keys = Object.keys(exprs) as K[];
  const rows = await getList(
    doctype,
    { fields: keys.map((k) => aggField(exprs[k], k)), filters, orFilters, limit: 1 },
    what,
  );
  const row = rows[0] ?? {};
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = num(row[k]) ?? 0;
  return out;
}

/** Record count that also supports OR filters (frappe.client.get_count does not). */
export async function count(doctype: string, filters: Filter[], what = doctype, orFilters?: Filter[]) {
  const { n } = await aggregate(doctype, { n: "count(name)" }, filters, what, orFilters);
  return n;
}

/** Grouped aggregate: `select <field>, <exprs> ... group by <field>`. */
export async function groupBy<K extends string>(
  doctype: string,
  field: string,
  exprs: Record<K, string>,
  filters: Filter[],
  opts: { orderBy?: string; limit?: number; what?: string } = {},
): Promise<Array<{ key: string | null } & Record<K, number>>> {
  const keys = Object.keys(exprs) as K[];
  const rows = await getList(
    doctype,
    {
      fields: [field, ...keys.map((k) => aggField(exprs[k], k))],
      filters,
      groupBy: field,
      orderBy: opts.orderBy,
      limit: opts.limit ?? 0,
    },
    opts.what ?? doctype,
  );
  return rows.map((row) => {
    const out = { key: str(row[field]) } as { key: string | null } & Record<K, number>;
    for (const k of keys) (out as Record<string, unknown>)[k] = num(row[k]) ?? 0;
    return out;
  });
}

/** Builds OR filters for a free-text search over several fields. */
export function searchFilters(q: string | undefined, fields: string[]): Filter[] {
  const term = (q ?? "").replace(/[%_]/g, "").trim();
  if (!term) return [];
  return fields.map((f) => [f, "like", `%${term}%`] as Filter);
}

// --- tolerant parsing of Frappe values -------------------------------------

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function bool(v: unknown): boolean {
  return v === 1 || v === "1" || v === true;
}
