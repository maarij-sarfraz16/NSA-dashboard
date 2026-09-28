import Link from "next/link";
import type { ReactNode } from "react";
import { formatPercent, percentChange } from "@/lib/format";

export type Delta = {
  current: number;
  previous: number;
  /** e.g. "vs same period last month" */
  label: string;
  /** Whether an increase is favourable (sales up = good, overdue up = bad). */
  upIsGood?: boolean;
};

function DeltaLine({ delta }: { delta: Delta }) {
  const change = percentChange(delta.current, delta.previous);
  if (change === null) {
    return <span className="text-ink-3">No comparable figure {delta.label}</span>;
  }
  const up = change > 0;
  const flat = Math.abs(change) < 0.05;
  const good = flat ? null : up === (delta.upIsGood ?? true);
  const tone = good === null ? "text-ink-3" : good ? "text-good" : "text-bad";
  return (
    <span>
      <span className={`font-medium ${tone}`}>
        <span aria-hidden>{flat ? "■" : up ? "▲" : "▼"}</span> {formatPercent(Math.abs(change), 1)}
        <span className="sr-only">{flat ? " unchanged" : up ? " increase" : " decrease"}</span>
      </span>{" "}
      <span className="text-ink-3">{delta.label}</span>
    </span>
  );
}

export function Kpi({
  label,
  value,
  title,
  sub,
  delta,
  tone,
  href,
}: {
  label: string;
  value: ReactNode;
  /** Full-precision value shown on hover when `value` is compacted. */
  title?: string;
  sub?: ReactNode;
  delta?: Delta | null;
  tone?: "bad" | "warn";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
        {tone && (
          <span
            aria-hidden
            className={`inline-block size-1.5 rounded-full ${tone === "bad" ? "bg-bad" : "bg-warn"}`}
          />
        )}
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink" title={title}>
        {value}
      </div>
      {(delta || sub) && (
        <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug text-ink-3">
          {delta && <DeltaLine delta={delta} />}
          {sub && <div>{sub}</div>}
        </div>
      )}
    </>
  );
  const cls = "block min-w-0 rounded-md border border-line bg-surface px-4 py-3.5 shadow-card";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const lg = cols === 5 ? "xl:grid-cols-5" : cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lg}`}>{children}</div>;
}
