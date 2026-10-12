import "server-only";

import { cache } from "react";
import { getList, str } from "@/lib/erp/query";
import { addDays, addMonths, isYmd, monthEnd, monthStart, parseYmd, ymd } from "@/lib/erp/context";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "last_7"
  | "mtd"
  | "last_month"
  | "qtd"
  | "fytd"
  | "last_30"
  | "last_90"
  | "custom";

export type Period = {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  /** The equivalent preceding window, for "vs previous period" comparisons. */
  previous?: { from: string; to: string; label: string };
};

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7", label: "Last 7 days" },
  { key: "mtd", label: "Month to date" },
  { key: "last_month", label: "Last month" },
  { key: "qtd", label: "Quarter to date" },
  { key: "fytd", label: "Fiscal year to date" },
  { key: "last_30", label: "Last 30 days" },
  { key: "last_90", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
];

type FiscalYear = { name: string; start: string; end: string };

/** The ERPNext Fiscal Year containing `today`, if one is defined. */
export const getFiscalYear = cache(async (today: string): Promise<FiscalYear | null> => {
  const rows = await getList(
    "Fiscal Year",
    {
      fields: ["name", "year_start_date", "year_end_date"],
      filters: [
        ["year_start_date", "<=", today],
        ["year_end_date", ">=", today],
        ["disabled", "=", 0],
      ],
      orderBy: "year_start_date desc",
      limit: 1,
    },
    "fiscal years",
  );
  const r = rows[0];
  const start = str(r?.year_start_date);
  const end = str(r?.year_end_date);
  return r && start && end ? { name: str(r.name) ?? "", start, end } : null;
});

function sameDayPreviousMonth(today: string): string {
  const { y, m, d } = parseYmd(today);
  const prevEnd = monthEnd(ymd(y, m - 1, 1));
  const candidate = ymd(y, m - 1, d);
  // clamp e.g. 31 Mar -> 28/29 Feb
  return candidate > prevEnd || parseYmd(candidate).m !== parseYmd(prevEnd).m ? prevEnd : candidate;
}

export async function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  today: string,
): Promise<Period> {
  // default view is today; unknown values fall back to it as well
  const key: PeriodKey = PERIOD_OPTIONS.some((o) => o.key === params.period) ? (params.period as PeriodKey) : "today";

  if (key === "custom" && isYmd(params.from) && isYmd(params.to)) {
    // never report beyond today; a reversed range is read the way the user meant it
    const a = params.from < today ? params.from : today;
    const b = params.to < today ? params.to : today;
    const [from, to] = a <= b ? [a, b] : [b, a];
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    return {
      key,
      label: "Custom range",
      from,
      to,
      previous: {
        from: addDays(from, -days),
        to: addDays(from, -1),
        label: days === 1 ? "the day before" : `previous ${days} days`,
      },
    };
  }

  switch (key) {
    case "today":
    case "yesterday": {
      const day = key === "today" ? today : addDays(today, -1);
      const prev = addDays(day, -1);
      return {
        key,
        label: key === "today" ? "Today" : "Yesterday",
        from: day,
        to: day,
        previous: { from: prev, to: prev, label: "the day before" },
      };
    }
    case "last_month": {
      const from = addMonths(today, -1);
      const to = monthEnd(from);
      const pFrom = addMonths(today, -2);
      return {
        key,
        label: "Last month",
        from,
        to,
        previous: { from: pFrom, to: monthEnd(pFrom), label: "the month before" },
      };
    }
    case "qtd": {
      const { y, m } = parseYmd(today);
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const from = ymd(y, qStartMonth, 1);
      const elapsed = Math.round((Date.parse(today) - Date.parse(from)) / 86400000);
      const pFrom = ymd(y, qStartMonth - 3, 1);
      return {
        key,
        label: "Quarter to date",
        from,
        to: today,
        previous: { from: pFrom, to: addDays(pFrom, elapsed), label: "same point last quarter" },
      };
    }
    case "mtd":
      break;
    case "fytd": {
      const fy = await getFiscalYear(today);
      if (fy) {
        return { key, label: `Fiscal year ${fy.name} to date`, from: fy.start, to: today };
      }
      break;
    }
    case "last_7":
    case "last_30":
    case "last_90": {
      const days = key === "last_7" ? 7 : key === "last_30" ? 30 : 90;
      const from = addDays(today, -(days - 1));
      return {
        key,
        label: `Last ${days} days`,
        from,
        to: today,
        previous: { from: addDays(from, -days), to: addDays(from, -1), label: `previous ${days} days` },
      };
    }
  }

  return {
    key: "mtd",
    label: "Month to date",
    from: monthStart(today),
    to: today,
    previous: {
      from: addMonths(today, -1),
      to: sameDayPreviousMonth(today),
      label: "same period last month",
    },
  };
}
