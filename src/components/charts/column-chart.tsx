"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";

export type SeriesSlot = 1 | 2 | 3 | 4 | 5;
export type ChartSeries = { name: string; values: number[]; slot: SeriesSlot };
export type ValueFormat = { kind: "money"; currency: string } | { kind: "number" };

const colorOf = (slot: SeriesSlot) => `var(--series-${slot})`;

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function ticks(min: number, max: number, target = 4) {
  if (min === max) max = min + 1;
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Bar with a 4px rounded data end and a square baseline end (handles negatives). */
function barPath(x: number, yBase: number, yEnd: number, w: number, round: boolean) {
  const h = Math.abs(yEnd - yBase);
  const r = round ? Math.min(4, w / 2, h) : 0;
  const up = yEnd <= yBase;
  if (up) {
    return `M${x},${yBase}V${yEnd + r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd + r}V${yBase}Z`;
  }
  return `M${x},${yBase}V${yEnd - r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd - r}V${yBase}Z`;
}

export function ColumnChart({
  labels,
  tooltipLabels,
  series,
  stacked = false,
  format,
  height = 220,
  caption,
}: {
  labels: string[];
  tooltipLabels?: string[];
  series: ChartSeries[];
  stacked?: boolean;
  format: ValueFormat;
  height?: number;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmtAxis = (v: number) =>
    format.kind === "money" ? formatMoneyCompact(v) : formatNumber(v, Math.abs(v) < 10 ? 1 : 0);
  const fmtFull = (v: number) => (format.kind === "money" ? formatMoney(v, format.currency) : formatNumber(v));

  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const all = stacked ? totals : series.flatMap((s) => s.values);
  const yTicks = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];

  const axisWidth = Math.max(...yTicks.map((t) => fmtAxis(t).length)) * 6.6 + 10;
  const m = { top: 8, right: 4, bottom: 24, left: axisWidth };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const y = (v: number) => m.top + ((yMax - v) / (yMax - yMin || 1)) * innerH;
  const band = n ? innerW / n : 0;
  const groups = stacked ? 1 : series.length;
  const barW = Math.max(2, Math.min(24, (band * 0.64 - (groups - 1) * 2) / groups));
  const groupW = groups * barW + (groups - 1) * 2;
  const labelEvery = Math.max(1, Math.ceil((n * 44) / Math.max(1, innerW)));
  const zeroY = y(0);

  const tooltipLeft = active === null ? 0 : m.left + band * active + band / 2;

  return (
    <figure className="m-0">
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Legend">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: colorOf(s.slot) }} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`${caption}. Use left and right arrow keys to read values, or open the data table below.`}
        aria-describedby={tableId}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((a) => (a === null ? 0 : Math.min(n - 1, a + 1)));
          else if (e.key === "ArrowLeft") setActive((a) => (a === null ? n - 1 : Math.max(0, a - 1)));
          else if (e.key === "Escape") setActive(null);
        }}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text
                  x={m.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="tabular fill-ink-3 text-[11px]"
                >
                  {fmtAxis(t)}
                </text>
              </g>
            ))}
            <line x1={m.left} x2={width - m.right} y1={zeroY} y2={zeroY} stroke="var(--axis)" strokeWidth={1} />

            {active !== null && (
              <rect x={m.left + band * active} y={m.top} width={band} height={innerH} fill="var(--surface-2)" />
            )}

            {labels.map((label, i) => {
              const x0 = m.left + band * i + (band - groupW) / 2;
              let posAcc = 0;
              let negAcc = 0;
              const lastPos = stacked ? series.map((s) => s.values[i] ?? 0).findLastIndex((v) => v > 0) : -1;
              return (
                <g key={i}>
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    if (!v) return null;
                    if (stacked) {
                      const start = v >= 0 ? posAcc : negAcc;
                      const end = start + v;
                      if (v >= 0) posAcc = end;
                      else negAcc = end;
                      const y0 = y(start);
                      let y1 = y(end);
                      // 2px surface gap between stacked segments
                      if (si !== lastPos && Math.abs(y1 - y0) > 3) y1 += v >= 0 ? 2 : -2;
                      return (
                        <path key={s.name} d={barPath(x0, y0, y1, barW, si === lastPos)} fill={colorOf(s.slot)} />
                      );
                    }
                    const x = x0 + si * (barW + 2);
                    return <path key={s.name} d={barPath(x, zeroY, y(v), barW, true)} fill={colorOf(s.slot)} />;
                  })}
                  {i % labelEvery === 0 && (
                    <text
                      x={m.left + band * i + band / 2}
                      y={height - 6}
                      textAnchor="middle"
                      className="fill-ink-3 text-[11px]"
                    >
                      {label}
                    </text>
                  )}
                  <rect
                    x={m.left + band * i}
                    y={m.top}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setActive(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {active !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded border border-line bg-surface px-3 py-2 text-[12px] shadow-md"
            style={{
              left: Math.min(Math.max(tooltipLeft, 90), width - 90),
              transform: "translateX(-50%)",
            }}
            role="status"
          >
            <p className="mb-1 font-semibold text-ink">{(tooltipLabels ?? labels)[active]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-4 text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-sm" style={{ background: colorOf(s.slot) }} aria-hidden />
                  {s.name}
                </span>
                <span className="tabular font-medium text-ink">{fmtFull(s.values[active] ?? 0)}</span>
              </p>
            ))}
            {stacked && series.length > 1 && (
              <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-ink-2">
                <span>Total</span>
                <span className="tabular font-medium text-ink">{fmtFull(totals[active])}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer select-none text-ink-3 hover:text-ink-2">Show data table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded border border-line">
          <table id={tableId} className="w-full text-[12px]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-semibold text-ink-3">
                  Period
                </th>
                {series.map((s) => (
                  <th key={s.name} scope="col" className="px-3 py-1.5 text-right font-semibold text-ink-3">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-2">
                    {(tooltipLabels ?? labels)[i]}
                  </th>
                  {series.map((s) => (
                    <td key={s.name} className="tabular px-3 py-1.5 text-right text-ink">
                      {fmtFull(s.values[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
