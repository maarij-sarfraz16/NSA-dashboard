import Link from "next/link";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Hide below this breakpoint to keep narrow screens readable. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3 ${
                  c.align === "right" ? "text-right" : "text-left"
                } ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-b-0 hover:bg-surface-2">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2.5 align-middle text-ink ${
                    c.align === "right" ? "tabular text-right whitespace-nowrap" : ""
                  } ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.className ?? ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Link-based pagination that preserves the current query string. */
export function Pagination({
  page,
  pageSize,
  total,
  pathname,
  params,
  pageKey = "page",
}: {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  params: Record<string, string | undefined>;
  pageKey?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set(pageKey, String(p));
    else qs.delete(pageKey);
    const s = qs.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const btn =
    "inline-flex h-8 items-center rounded border border-line px-3 text-[12.5px] font-medium text-ink-2";
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3"
    >
      <span className="tabular">
        {total === 0 ? "No records" : `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          {page > 1 ? (
            <Link className={`${btn} hover:bg-surface-2`} href={href(page - 1)} rel="prev">
              Previous
            </Link>
          ) : (
            <span className={`${btn} opacity-45`} aria-disabled>
              Previous
            </span>
          )}
          <span className="tabular px-1">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className={`${btn} hover:bg-surface-2`} href={href(page + 1)} rel="next">
              Next
            </Link>
          ) : (
            <span className={`${btn} opacity-45`} aria-disabled>
              Next
            </span>
          )}
        </span>
      )}
    </nav>
  );
}
