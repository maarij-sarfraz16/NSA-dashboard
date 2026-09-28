import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";

/** Ranked horizontal bars (single series). Every value is printed, so no tooltip is needed. */
export function BarList({
  items,
  currency,
  countLabel,
}: {
  items: { key: string; label: string; total: number; count: number }[];
  currency: string;
  countLabel: string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.total)), 0);
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink" title={item.label}>
              {item.label}
            </span>
            <span className="tabular shrink-0 font-medium text-ink" title={formatMoney(item.total, currency)}>
              {formatMoneyCompact(item.total, currency)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-sm bg-surface-2">
              <div
                className="h-1.5 rounded-sm"
                style={{
                  width: `${max ? Math.max(1, (Math.abs(item.total) / max) * 100) : 0}%`,
                  background: "var(--series-1)",
                }}
              />
            </div>
            <span className="tabular w-20 shrink-0 text-right text-[11.5px] text-ink-3">
              {formatNumber(item.count)} {countLabel}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Part-to-whole bar with a labelled legend (all counts and shares printed). */
export function Composition({
  parts,
  total,
}: {
  parts: { label: string; value: number; color: string }[];
  total: number;
}) {
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-sm bg-surface-2" aria-hidden>
        {visible.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / (total || 1)) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="tabular text-ink">
              {formatNumber(p.value)}
              <span className="ml-1 text-ink-3">
                {total ? `${Math.round((p.value / total) * 100)}%` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
