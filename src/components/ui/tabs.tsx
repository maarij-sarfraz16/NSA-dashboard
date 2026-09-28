import Link from "next/link";
import { formatNumber } from "@/lib/format";

function hrefFor(pathname: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/**
 * Segmented, URL-driven filter chips with a count each (server rendered). The
 * first chip clears `paramKey`; `null` counts render as "—" (count unavailable).
 */
export function ChipTabs({
  chips,
  active,
  pathname,
  params,
  paramKey,
  label,
}: {
  chips: { value: string; label: string; count: number | null }[];
  active: string;
  pathname: string;
  params: Record<string, string | undefined>;
  paramKey: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap overflow-hidden rounded border border-line">
      {chips.map((c, i) => {
        const selected = c.value === active;
        return (
          <Link
            key={c.value}
            href={hrefFor(pathname, { ...params, [paramKey]: i === 0 ? undefined : c.value, page: undefined })}
            aria-current={selected ? "true" : undefined}
            scroll={false}
            className={`flex h-8 items-center gap-2 border-r border-line px-3 text-[12.5px] last:border-r-0 ${
              selected ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {c.label}
            <span className="tabular text-[12px] font-normal text-ink-3">
              {c.count === null ? "—" : formatNumber(c.count)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** URL-driven tabs (server rendered). */
export function Tabs({
  tabs,
  active,
  pathname,
  params,
  paramKey = "view",
}: {
  tabs: { value: string; label: string }[];
  active: string;
  pathname: string;
  params: Record<string, string | undefined>;
  paramKey?: string;
}) {
  return (
    <div role="tablist" className="flex gap-4 border-b border-line px-4">
      {tabs.map((t, i) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
        if (i === 0) qs.delete(paramKey);
        else qs.set(paramKey, t.value);
        const s = qs.toString();
        const selected = t.value === active;
        return (
          <Link
            key={t.value}
            role="tab"
            aria-selected={selected}
            href={s ? `${pathname}?${s}` : pathname}
            scroll={false}
            className={`-mb-px border-b-2 py-2.5 text-[13px] font-medium ${
              selected ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
