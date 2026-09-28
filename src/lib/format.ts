/** Display formatting shared by server and client components. Missing values render as an em dash. */

const LOCALE = "en-US";
export const MISSING = "—";

export function formatNumber(v: number | null | undefined, maxFractionDigits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFractionDigits }).format(v);
}

export function formatMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${currency} ${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
}

/** Money amount without a currency code, for table columns whose header names the currency. */
export function formatAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

/** Compact money for tiles/axes: "PKR 12.4M". Always pair with the full value in a title/tooltip. */
export function formatMoneyCompact(v: number | null | undefined, currency?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  const s = new Intl.NumberFormat(LOCALE, {
    notation: "compact",
    maximumFractionDigits: Math.abs(v) >= 1000 ? 1 : 0,
  }).format(v);
  return currency ? `${currency} ${s}` : s;
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return `${v.toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" -> "28 Sep 2026" without going through the JS timezone. */
export function formatDate(v: string | null | undefined): string {
  if (!v) return MISSING;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-09-28 14:05:11.000" -> "28 Sep 2026, 14:05" (ERPNext system time zone). */
export function formatDateTime(v: string | null | undefined): string {
  if (!v) return MISSING;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(v);
  if (!m) return formatDate(v);
  return `${formatDate(m[1])}, ${m[2]}:${m[3]}`;
}

export function formatTime(v: string | null | undefined): string {
  if (!v) return MISSING;
  const m = /[ T](\d{2}):(\d{2})/.exec(v);
  return m ? `${m[1]}:${m[2]}` : MISSING;
}

/** "2026-09" -> "Sep 2026" (or "Sep" when short). */
export function formatMonth(key: string, short = false): string {
  const [y, mo] = key.split("-");
  const name = MONTHS[Number(mo) - 1] ?? key;
  return short ? name : `${name} ${y}`;
}

/** Relative change, or null when there is no meaningful base. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
