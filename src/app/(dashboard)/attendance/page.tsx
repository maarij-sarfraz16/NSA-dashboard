import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Composition } from "@/components/charts/bar-list";
import { ColumnChart, type SeriesSlot } from "@/components/charts/column-chart";
import { guardPage } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { Filters } from "@/components/ui/filters";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Flag, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/ui/states";
import { ChipTabs } from "@/components/ui/tabs";
import {
  ATTENDANCE_SORTS,
  ATTENDANCE_STATUSES,
  filterAttendance,
  getAttendanceDay,
  getAttendanceDepartments,
  getAttendanceRecords,
  getAttendanceSummary,
  getAttendanceTrend,
  getLatestAttendanceDate,
  getShiftTypes,
  NO_SHIFT,
  NOT_MARKED,
  type AttendanceQuery,
  type AttendanceSort,
  type AttendanceSummary,
  type ShiftType,
} from "@/lib/data/attendance";
import { pageParam, param, type SearchParams } from "@/lib/data/scope";
import { attempt } from "@/lib/data/shared";
import { addDays, isYmd, monthEnd } from "@/lib/erp/context";
import { formatDate, formatMonth, formatNumber, formatPercent, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Attendance" };

type Props = { searchParams: Promise<SearchParams> };

/**
 * Slots follow stack order so adjacent segments use the validated adjacent pairs
 * (CVD-checked); "Not marked" is neutral grey.
 */
const SLOT: Record<(typeof ATTENDANCE_STATUSES)[number], SeriesSlot> = {
  Present: 1,
  "Work From Home": 2,
  "Half Day": 3,
  "On Leave": 4,
  Absent: 5,
};

const TREND_DAYS = [7, 14, 30, 60] as const;

/** URL params that make up the view, kept by pagination links. */
const VIEW_KEYS = ["company", "date", "month", "shift", "status", "department", "q", "sort", "days", "group"] as const;

/** Record flags offered next to the statuses in the `status` chips. */
const LATE = "Late";
const EARLY = "Early exit";
const STATUS_CHIPS: string[] = [...ATTENDANCE_STATUSES, LATE, EARLY, NOT_MARKED];

/** "07:00" from Frappe's "7:00:00". */
function hhmm(t: string | null) {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function shiftLabel(s: ShiftType) {
  const start = hhmm(s.start);
  const end = hhmm(s.end);
  return start && end ? `${s.name} (${start}–${end})` : s.name;
}

const isYm = (s: string | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export default async function AttendancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Attendance", "attendance", sp);
  if (!g.ok) return g.node;
  const { scope } = g;
  const company = scope.company.name;
  const today = scope.today;

  const requestedDate = param(sp, "date");
  let date = isYmd(requestedDate) && requestedDate <= today ? requestedDate : undefined;
  const requestedMonth = param(sp, "month");
  const month = !date && isYm(requestedMonth) && requestedMonth <= today.slice(0, 7) ? requestedMonth : undefined;

  // "Not marked" only exists for a single day (no record to list); without a date it means today
  let status = param(sp, "status");
  if (status === NOT_MARKED && !date) {
    if (month) status = undefined;
    else date = today;
  }
  if (status && !STATUS_CHIPS.includes(status)) status = undefined;
  const sortParam = param(sp, "sort");
  const sort = ATTENDANCE_SORTS.find((s) => s.value === sortParam)?.value;

  // a missing Shift Type permission only limits the shift filter to what the URL asks for
  const shifts = await attempt(() => getShiftTypes());
  const requestedShift = param(sp, "shift");
  const shift =
    requestedShift &&
    (requestedShift === NO_SHIFT || !shifts.ok || shifts.data.some((s) => s.name === requestedShift))
      ? requestedShift
      : undefined;

  const range = date ? { from: date, to: date } : month ? { from: `${month}-01`, to: monthEnd(`${month}-01`) } : {};
  const query: AttendanceQuery = {
    company,
    ...range,
    shift,
    status: status && (ATTENDANCE_STATUSES as readonly string[]).includes(status) ? status : undefined,
    flag: status === LATE ? "late" : status === EARLY ? "early" : undefined,
    department: param(sp, "department"),
    q: param(sp, "q"),
  };
  const periodLabel = date
    ? `${formatDate(date)}${date === today ? " (today)" : ""}`
    : month
      ? formatMonth(month)
      : "All dates";
  const days = TREND_DAYS.find((d) => String(d) === param(sp, "days")) ?? 14;
  const viewKey = VIEW_KEYS.map((k) => (k === "date" ? date : k === "status" ? status : param(sp, k)) ?? "").join("|");
  const shiftOptions = [
    { value: "", label: "All shifts" },
    ...(shifts.ok ? shifts.data.map((s) => ({ value: s.name, label: shiftLabel(s) })) : []),
    ...(!shifts.ok && shift && shift !== NO_SHIFT ? [{ value: shift, label: shift }] : []),
    { value: NO_SHIFT, label: "No shift on record" },
  ];
  const toolbar: ToolbarProps = { query, date, shift, status, sort, today, shiftOptions, sp };

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${company} · ${periodLabel}${shift ? ` · ${shift}` : ""}`} scope={scope}>
        <Filters
          fields={[
            { kind: "date", name: "date", label: "Date", max: today, clears: ["month"] },
            { kind: "month", name: "month", label: "Month", max: today.slice(0, 7), clears: ["date"] },
            { kind: "select", name: "shift", label: "Shift", defaultValue: "", options: shiftOptions },
          ]}
          resetKeys={["page"]}
        />
        {(date || month || shift || status || param(sp, "department") || param(sp, "q") || sort) && (
          <ClearLink sp={sp} />
        )}
      </PageHeader>
      <PageBody>
        {status === NOT_MARKED && date ? (
          <Suspense key={`${viewKey}-${pageParam(sp)}`} fallback={<PanelSkeleton title="Not marked" />}>
            <NotMarked {...toolbar} date={date} />
          </Suspense>
        ) : (
          <>
            <Suspense key={`kpi-${viewKey}`} fallback={<SummarySkeleton />}>
              <Summary query={query} date={date} shift={shift} periodLabel={periodLabel} sp={sp} />
            </Suspense>
            <Suspense key={`rec-${viewKey}-${pageParam(sp)}`} fallback={<PanelSkeleton title="Attendance records" />}>
              <Records {...toolbar} />
            </Suspense>
            <Suspense key={`trend-${viewKey}`} fallback={<PanelSkeleton title="Daily attendance" />}>
              <Trend query={query} date={date} month={month} days={days} today={today} />
            </Suspense>
          </>
        )}
      </PageBody>
    </>
  );
}

function ClearLink({ sp }: { sp: SearchParams }) {
  const company = param(sp, "company");
  return (
    <a
      href={company ? `/attendance?company=${encodeURIComponent(company)}` : "/attendance"}
      className="text-[12.5px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
    >
      Clear filters
    </a>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-5">
      <KpiSkeleton />
      <PanelSkeleton title="Status breakdown" height={60} />
    </div>
  );
}

async function Summary({
  query,
  date,
  shift,
  periodLabel,
  sp,
}: {
  query: AttendanceQuery;
  date?: string;
  shift?: string;
  periodLabel: string;
  sp: SearchParams;
}) {
  // for a single day, also count active employees with no record (not meaningful for "no shift")
  const [r, day] = await Promise.all([
    attempt(() => getAttendanceSummary(query)),
    date ? attempt(() => getAttendanceDay(query.company, date, shift === NO_SHIFT ? undefined : shift)) : null,
  ]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const s = r.data;
  const c = s.counts;
  const present = (c["Present"] ?? 0) + (c["Work From Home"] ?? 0) + (c["Half Day"] ?? 0);
  const notMarked = day?.ok && shift !== NO_SHIFT ? (day.data.counts[NOT_MARKED] ?? 0) : null;
  const share = (n: number) => (s.total ? formatPercent((n / s.total) * 100) : "—");

  return (
    <div className="space-y-5">
      <KpiGrid cols={notMarked !== null ? 5 : 4}>
        <Kpi
          label="Records"
          value={formatNumber(s.total)}
          sub={`${periodLabel} · submitted${s.drafts > 0 ? ` · ${formatNumber(s.drafts)} drafts not counted` : ""}`}
        />
        <Kpi label="Present" value={formatNumber(present)} sub={`${share(present)} of records · incl. WFH and half day`} />
        <Kpi
          label="Absent"
          tone={(c["Absent"] ?? 0) > 0 ? "bad" : undefined}
          value={formatNumber(c["Absent"] ?? 0)}
          sub={`${share(c["Absent"] ?? 0)} · ${formatNumber(s.late)} late · ${formatNumber(s.earlyExit)} early exits`}
        />
        <Kpi label="On leave" value={formatNumber(c["On Leave"] ?? 0)} sub={`${share(c["On Leave"] ?? 0)} of records`} />
        {notMarked !== null && (
          <Kpi
            label="Not marked"
            tone={notMarked > 0 ? "warn" : undefined}
            value={formatNumber(notMarked)}
            sub={`${shift ? "Rostered on this shift" : "Active employees"} with no submitted record`}
          />
        )}
      </KpiGrid>

      {s.total > 0 && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel title="Status breakdown" description={`${formatNumber(s.total)} submitted records`}>
            <Composition
              total={s.total}
              parts={ATTENDANCE_STATUSES.map((st) => ({
                label: st,
                value: c[st] ?? 0,
                color: `var(--series-${SLOT[st]})`,
              }))}
            />
          </Panel>
          <div className="xl:col-span-2">
            <BreakdownTable summary={s} group={param(sp, "group") === "department" ? "department" : "shift"} />
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ summary, group }: { summary: AttendanceSummary; group: "department" | "shift" }) {
  const byShift = group === "shift";
  return (
    <Panel
      flush
      title={byShift ? "By shift" : "By department"}
      actions={
        <Filters
          fields={[
            {
              kind: "select",
              name: "group",
              label: "Group by",
              defaultValue: "shift",
              options: [
                { value: "shift", label: "Shift" },
                { value: "department", label: "Department" },
              ],
            },
          ]}
          resetKeys={[]}
        />
      }
    >
      <div className="max-h-80 overflow-auto">
        <DataTable
          caption={byShift ? "Attendance by shift" : "Attendance by department"}
          rows={byShift ? summary.byShift : summary.byDepartment}
          rowKey={(d) => d.group}
          columns={[
            { key: "group", header: byShift ? "Shift" : "Department", cell: (d) => d.group },
            ...ATTENDANCE_STATUSES.map((s) => ({
              key: s,
              header: s === "Work From Home" ? "WFH" : s,
              align: "right" as const,
              hideBelow: s === "Half Day" || s === "Work From Home" ? ("md" as const) : undefined,
              cell: (d: AttendanceSummary["byShift"][number]) => formatNumber(d.counts[s] ?? 0),
            })),
            { key: "total", header: "Total", align: "right", cell: (d) => formatNumber(d.total) },
          ]}
        />
      </div>
    </Panel>
  );
}

function viewParams(sp: SearchParams, overrides: Record<string, string | undefined> = {}) {
  return { ...Object.fromEntries(VIEW_KEYS.map((k) => [k, param(sp, k)])), ...overrides };
}

function attendanceHref(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/attendance?${s}` : "/attendance";
}

type ToolbarProps = {
  query: AttendanceQuery;
  date?: string;
  shift?: string;
  status?: string;
  sort?: AttendanceSort;
  today: string;
  shiftOptions: { value: string; label: string }[];
  sp: SearchParams;
};

/** ‹ day › stepper; without a chosen day it steps from today. */
function DayStepper({ date, today, sp }: { date?: string; today: string; sp: SearchParams }) {
  const anchor = date ?? today;
  const prev = addDays(anchor, -1);
  const next = date ? addDays(date, 1) : undefined;
  const href = (d: string) => attendanceHref(viewParams(sp, { date: d, month: undefined, page: undefined }));
  const btn = "inline-flex h-8 w-8 items-center justify-center rounded border border-line text-[14px] text-ink-2";
  return (
    <div className="flex items-center gap-1.5">
      <Link className={`${btn} hover:bg-surface-2 hover:text-ink`} href={href(prev)} scroll={false} aria-label="Previous day">
        ‹
      </Link>
      <Filters fields={[{ kind: "date", name: "date", label: "Day", max: today, clears: ["month"] }]} />
      {next && next <= today ? (
        <Link className={`${btn} hover:bg-surface-2 hover:text-ink`} href={href(next)} scroll={false} aria-label="Next day">
          ›
        </Link>
      ) : (
        <span className={`${btn} opacity-45`} aria-disabled>
          ›
        </span>
      )}
    </div>
  );
}

/** Search, department, shift and sort, then status chips with counts for the current filters. */
async function RecordToolbar({ query, date, shift, status, shiftOptions, sp }: ToolbarProps) {
  // chip counts ignore the chosen status so every chip shows what it would list
  const base = { ...query, status: undefined, flag: undefined };
  const [departments, summary, day] = await Promise.all([
    attempt(() => getAttendanceDepartments(query.company)),
    attempt(() => getAttendanceSummary(base)),
    date && shift !== NO_SHIFT
      ? attempt(() => getAttendanceDay(query.company, date, shift))
      : Promise.resolve(null),
  ]);
  const c = summary.ok ? summary.data.counts : null;
  const notMarked = day?.ok
    ? filterAttendance(day.data, { status: NOT_MARKED, department: query.department, q: query.q, page: 1 }).total
    : null;
  const chips = [
    { value: "", label: "All", count: summary.ok ? summary.data.total : null },
    ...ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s === "Work From Home" ? "WFH" : s, count: c?.[s] ?? null })),
    { value: LATE, label: LATE, count: summary.ok ? summary.data.late : null },
    { value: EARLY, label: EARLY, count: summary.ok ? summary.data.earlyExit : null },
    // not marked needs a single day
    ...(date && shift !== NO_SHIFT ? [{ value: NOT_MARKED, label: NOT_MARKED, count: notMarked }] : []),
  ];

  return (
    <div className="space-y-3 border-b border-line px-4 py-3">
      <Filters
        fields={[
          { kind: "search", name: "q", placeholder: "Search employee name or ID" },
          {
            kind: "select",
            name: "department",
            label: "Department",
            defaultValue: "",
            options: [
              { value: "", label: "All departments" },
              ...(departments.ok ? departments.data.map((d) => ({ value: d, label: d })) : []),
            ],
          },
          { kind: "select", name: "shift", label: "Shift", defaultValue: "", options: shiftOptions },
          {
            kind: "select",
            name: "sort",
            label: "Sort",
            defaultValue: "newest",
            options: ATTENDANCE_SORTS.filter((s) => status !== NOT_MARKED || NOT_MARKED_SORTS.includes(s.value)).map(
              (s) => ({ value: s.value, label: s.label }),
            ),
          },
        ]}
      />
      <ChipTabs
        label="Filter by status"
        chips={chips}
        active={status ?? ""}
        pathname="/attendance"
        params={viewParams(sp, { date })}
        paramKey="status"
      />
    </div>
  );
}

/** Sorts that make sense for employees with no record (no date, status or times). */
const NOT_MARKED_SORTS: AttendanceSort[] = ["newest", "id", "name", "department", "shift"];

function recordsDescription(date: string | undefined, sort: AttendanceSort | undefined) {
  const label = (ATTENDANCE_SORTS.find((s) => s.value === sort) ?? ATTENDANCE_SORTS[0]).label;
  return `Submitted records${date ? ` for ${formatDate(date)}` : ""} · sorted by ${label.toLowerCase()}`;
}

async function Records(props: ToolbarProps) {
  const { query, date, status, sort, today, sp } = props;
  const r = await attempt(() => getAttendanceRecords(query, pageParam(sp), sort));
  return (
    <Panel
      flush
      title={date ? `Attendance records · ${formatDate(date)}` : "Attendance records"}
      description={recordsDescription(date, sort)}
      actions={<DayStepper date={date} today={today} sp={sp} />}
    >
      <RecordToolbar {...props} />
      {r.ok ? (
        <>
          <DataTable
            caption="Attendance records"
            rows={r.data.rows}
            rowKey={(row) => row.id}
            empty={
              <EmptyState title="No attendance records match these filters">
                {date && !status ? "ERPNext may not have marked attendance for this day yet." : undefined}
              </EmptyState>
            }
            columns={[
              { key: "date", header: "Date", cell: (row) => formatDate(row.date), className: "whitespace-nowrap" },
              {
                key: "employee",
                header: "Employee",
                cell: (row) => (
                  <>
                    <span className="block">{row.employeeName ?? row.employee}</span>
                    <span className="block text-[12px] text-ink-3">{row.employee}</span>
                  </>
                ),
              },
              { key: "dept", header: "Department", cell: (row) => row.department ?? "—", hideBelow: "md" },
              { key: "shift", header: "Shift", cell: (row) => row.shift ?? "—", hideBelow: "lg" },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <>
                    <StatusBadge status={row.status} />
                    {row.leaveType && <span className="ml-1.5 text-[12px] text-ink-3">{row.leaveType}</span>}
                  </>
                ),
              },
              {
                key: "in",
                header: "In",
                align: "right",
                hideBelow: "sm",
                cell: (row) => (
                  <>
                    {formatTime(row.inTime)}
                    {row.lateEntry && <Flag tone="warn">Late</Flag>}
                  </>
                ),
              },
              {
                key: "out",
                header: "Out",
                align: "right",
                hideBelow: "sm",
                cell: (row) => (
                  <>
                    {formatTime(row.outTime)}
                    {row.earlyExit && <Flag tone="warn">Early</Flag>}
                  </>
                ),
              },
            ]}
          />
          <Pagination
            page={r.data.page}
            pageSize={r.data.pageSize}
            total={r.data.total}
            pathname="/attendance"
            params={viewParams(sp)}
          />
        </>
      ) : (
        <ErrorState error={r.error} />
      )}
    </Panel>
  );
}

/** Active employees with no submitted record on `date` (the only view that is not a list of records). */
async function NotMarked(props: ToolbarProps & { date: string }) {
  const { query, date, shift, sort, today, sp } = props;
  const r = await attempt(() => getAttendanceDay(query.company, date, shift === NO_SHIFT ? undefined : shift));
  const page = r.ok
    ? filterAttendance(r.data, {
        status: NOT_MARKED,
        department: query.department,
        q: query.q,
        sort,
        page: pageParam(sp),
      })
    : null;
  return (
    <Panel
      flush
      title={`Not marked · ${formatDate(date)}`}
      description={`Active employees${shift && shift !== NO_SHIFT ? ` rostered on ${shift}` : ""} with no submitted record on ${formatDate(date)}`}
      actions={<DayStepper date={date} today={today} sp={sp} />}
    >
      <RecordToolbar {...props} />
      {!r.ok ? (
        <ErrorState error={r.error} />
      ) : (
        <>
          <DataTable
            caption="Employees without attendance"
            rows={page!.rows}
            rowKey={(row) => row.employee}
            empty={<EmptyState title="Everyone has a submitted record" />}
            columns={[
              { key: "id", header: "Employee ID", cell: (row) => row.employee, className: "tabular whitespace-nowrap" },
              { key: "employee", header: "Employee", cell: (row) => row.employeeName ?? row.employee },
              { key: "dept", header: "Department", cell: (row) => row.department ?? "—", hideBelow: "md" },
              { key: "shift", header: "Assigned shift", cell: (row) => row.shift ?? "—", hideBelow: "sm" },
            ]}
          />
          <Pagination
            page={page!.page}
            pageSize={page!.pageSize}
            total={page!.total}
            pathname="/attendance"
            params={viewParams(sp, { date, status: NOT_MARKED })}
          />
        </>
      )}
    </Panel>
  );
}

async function Trend({
  query,
  date,
  month,
  days,
  today,
}: {
  query: AttendanceQuery;
  date?: string;
  month?: string;
  days: number;
  today: string;
}) {
  // a month shows its own days; otherwise the last `days` days up to the chosen day or the latest record
  let from: string;
  let to: string;
  if (month) {
    from = `${month}-01`;
    to = monthEnd(from) < today ? monthEnd(from) : today;
  } else {
    const latest = date ? null : await attempt(() => getLatestAttendanceDate(query.company));
    to = date ?? (latest?.ok && latest.data ? latest.data : today);
    from = addDays(to, -(days - 1));
  }
  const r = await attempt(() => getAttendanceTrend(query, from, to));
  const title = month ? `Daily attendance, ${formatMonth(month)}` : "Daily attendance";
  return (
    <Panel
      title={title}
      description={`Submitted records per day by status, ${formatDate(from)} – ${formatDate(to)}`}
      actions={
        !month && (
          <Filters
            fields={[
              {
                kind: "select",
                name: "days",
                label: "Show",
                defaultValue: "14",
                options: TREND_DAYS.map((d) => ({ value: String(d), label: `${d} days` })),
              },
            ]}
            resetKeys={[]}
          />
        )
      }
    >
      {r.ok ? (
        <ColumnChart
          caption={`Attendance by status, ${formatDate(from)} to ${formatDate(to)}`}
          stacked
          labels={r.data.dates.map((d) => formatDate(d).split(" ").slice(0, 2).join(" "))}
          tooltipLabels={r.data.dates.map((d) => formatDate(d))}
          series={ATTENDANCE_STATUSES.map((s) => ({ name: s, values: r.data.series[s], slot: SLOT[s] }))}
          format={{ kind: "number" }}
        />
      ) : (
        <ErrorState error={r.error} compact />
      )}
    </Panel>
  );
}
