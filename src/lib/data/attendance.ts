import "server-only";

import { cache } from "react";
import { addDays, daysBetween, companyFilter } from "@/lib/erp/context";
import { aggField, bool, count, getList, num, searchFilters, str, type Filter } from "@/lib/erp/query";
import { PAGE_SIZE, type Page } from "./shared";

export const ATTENDANCE_STATUSES = ["Present", "Work From Home", "Half Day", "On Leave", "Absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const NOT_MARKED = "Not Marked";
export const NO_SHIFT = "No shift";
export const NO_DEPARTMENT = "No department";

export type AttendanceRow = {
  employee: string;
  employeeName: string | null;
  department: string | null;
  status: AttendanceStatus | typeof NOT_MARKED;
  /** The shift on the attendance record, or for unmarked employees the shift they were assigned. */
  shift: string | null;
  leaveType: string | null;
  inTime: string | null;
  outTime: string | null;
  lateEntry: boolean;
  earlyExit: boolean;
};

type Employee = { id: string; name: string | null; department: string | null; defaultShift: string | null };

async function activeEmployees(company: string): Promise<Employee[]> {
  const rows = await getList(
    "Employee",
    {
      fields: ["name", "employee_name", "department", "default_shift"],
      filters: [companyFilter(company), ["status", "=", "Active"]],
      orderBy: "employee_name asc",
      limit: 0,
    },
    "active employees",
  );
  return rows.map((r) => ({
    id: str(r.name) ?? "",
    name: str(r.employee_name),
    department: str(r.department),
    defaultShift: str(r.default_shift),
  }));
}

export type ShiftType = { name: string; start: string | null; end: string | null };

/** All Shift Types defined in ERPNext, for the shift filter. */
export const getShiftTypes = cache(async (): Promise<ShiftType[]> => {
  const rows = await getList(
    "Shift Type",
    { fields: ["name", "start_time", "end_time"], orderBy: "start_time asc", limit: 0 },
    "shift types",
  );
  return rows.map((r) => ({ name: str(r.name) ?? "", start: str(r.start_time), end: str(r.end_time) }));
});

/**
 * Employee -> shifts from active, submitted Shift Assignments covering `date`.
 * HRMS allows overlapping assignments (e.g. rotating SHIFT A / SHIFT B), so an
 * employee can be rostered on more than one shift.
 */
async function shiftAssignments(company: string, date: string): Promise<Map<string, string[]>> {
  const rows = await getList(
    "Shift Assignment",
    {
      fields: ["employee", "shift_type"],
      filters: [
        companyFilter(company),
        ["docstatus", "=", 1],
        ["status", "=", "Active"],
        ["start_date", "<=", date],
      ],
      orFilters: [["end_date", "is", "not set"], ["end_date", ">=", date]],
      orderBy: "shift_type asc",
      limit: 0,
    },
    "shift assignments",
  );
  const roster = new Map<string, string[]>();
  for (const r of rows) {
    const emp = str(r.employee);
    const shift = str(r.shift_type);
    if (!emp || !shift) continue;
    const list = roster.get(emp) ?? [];
    if (!list.includes(shift)) list.push(shift);
    roster.set(emp, list);
  }
  return roster;
}

/**
 * Attendance for one day, optionally for one shift. Only submitted Attendance
 * records count; drafts are reported separately so the numbers are never
 * overstated. With a shift, "not marked" covers active employees rostered on
 * that shift (Shift Assignment or default shift) who have no record.
 */
export const getAttendanceDay = cache(async function getAttendanceDay(
  company: string,
  date: string,
  shift?: string,
) {
  const base: Filter[] = [companyFilter(company), ["attendance_date", "=", date]];
  if (shift) base.push(["shift", "=", shift]);
  const [allEmployees, assigned, records, drafts] = await Promise.all([
    activeEmployees(company),
    // unfiltered, the assigned shift is only shown per row, so a failure there shouldn't blank the day
    shift ? shiftAssignments(company, date) : shiftAssignments(company, date).catch(() => new Map<string, string[]>()),
    getList(
      "Attendance",
      {
        fields: ["employee", "employee_name", "department", "status", "shift", "leave_type", "in_time", "out_time",
          "late_entry", "early_exit"],
        filters: [...base, ["docstatus", "=", 1]],
        limit: 0,
      },
      "attendance records",
    ),
    count("Attendance", [...base, ["docstatus", "=", 0]], "draft attendance"),
  ]);
  // shifts in effect for each employee: assignments first (as HRMS resolves them), else default shift
  const shiftsOf = (e: Employee) => assigned.get(e.id) ?? (e.defaultShift ? [e.defaultShift] : []);
  const employees = shift ? allEmployees.filter((e) => shiftsOf(e).includes(shift)) : allEmployees;

  const rows: AttendanceRow[] = records.map((r) => ({
    employee: str(r.employee) ?? "",
    employeeName: str(r.employee_name),
    department: str(r.department),
    status: (str(r.status) ?? "Absent") as AttendanceStatus,
    shift: str(r.shift),
    leaveType: str(r.leave_type),
    inTime: str(r.in_time),
    outTime: str(r.out_time),
    lateEntry: bool(r.late_entry),
    earlyExit: bool(r.early_exit),
  }));

  const marked = new Set(rows.map((r) => r.employee));
  for (const e of employees) {
    if (!marked.has(e.id)) {
      rows.push({
        employee: e.id,
        employeeName: e.name,
        department: e.department,
        status: NOT_MARKED,
        shift: shift ?? (shiftsOf(e).join(", ") || null),
        leaveType: null,
        inTime: null,
        outTime: null,
        lateEntry: false,
        earlyExit: false,
      });
    }
  }
  rows.sort((a, b) => (a.employeeName ?? a.employee).localeCompare(b.employeeName ?? b.employee));

  const counts: Record<string, number> = { [NOT_MARKED]: 0 };
  for (const s of ATTENDANCE_STATUSES) counts[s] = 0;
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const breakdown = (keyOf: (r: AttendanceRow) => string) => {
    const groups = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = keyOf(r);
      const d = groups.get(key) ?? {};
      d[r.status] = (d[r.status] ?? 0) + 1;
      groups.set(key, d);
    }
    return [...groups.entries()]
      .map(([group, c]) => ({ group, counts: c, total: Object.values(c).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
  };

  return {
    date,
    shift: shift ?? null,
    /** Active employees in scope; with a shift, those rostered on it plus anyone marked on it. */
    activeEmployees: shift ? rows.length : employees.length,
    counts,
    late: rows.filter((r) => r.lateEntry).length,
    earlyExit: rows.filter((r) => r.earlyExit).length,
    drafts,
    rows,
    byDepartment: breakdown((r) => r.department ?? "No department"),
    byShift: breakdown((r) => r.shift ?? NO_SHIFT),
  };
});

export type AttendanceDay = Awaited<ReturnType<typeof getAttendanceDay>>;

/** Sort options for the record list; the first is the default (as the ERPNext list shows them). */
export const ATTENDANCE_SORTS = [
  { value: "newest", label: "Newest first", orderBy: "attendance_date desc, employee_name asc" },
  { value: "oldest", label: "Oldest first", orderBy: "attendance_date asc, employee_name asc" },
  { value: "id", label: "Employee ID", orderBy: "employee asc, attendance_date desc" },
  { value: "name", label: "Employee name", orderBy: "employee_name asc, attendance_date desc" },
  { value: "department", label: "Department", orderBy: "department asc, employee_name asc" },
  { value: "shift", label: "Shift", orderBy: "shift asc, employee_name asc" },
  { value: "status", label: "Status", orderBy: "status asc, employee_name asc" },
  { value: "in", label: "Check-in time", orderBy: "in_time asc, employee_name asc" },
] as const;
export type AttendanceSort = (typeof ATTENDANCE_SORTS)[number]["value"];

/** In-memory version of the sorts that apply to a day's rows (no date or times on unmarked rows). */
function compareRows(sort: AttendanceSort | undefined) {
  const text = (v: string | null) => v ?? "￿";
  const key: (r: AttendanceRow) => string =
    sort === "id"
      ? (r) => r.employee
      : sort === "department"
        ? (r) => text(r.department)
        : sort === "shift"
          ? (r) => text(r.shift)
          : (r) => r.employeeName ?? r.employee;
  return (a: AttendanceRow, b: AttendanceRow) =>
    key(a).localeCompare(key(b), undefined, { numeric: true }) ||
    (a.employeeName ?? a.employee).localeCompare(b.employeeName ?? b.employee);
}

export function filterAttendance(
  day: AttendanceDay,
  opts: { status?: string; department?: string; q?: string; sort?: AttendanceSort; page: number },
): Page<AttendanceRow> {
  const q = opts.q?.toLowerCase();
  const rows = day.rows
    .filter(
      (r) =>
        (!opts.status || r.status === opts.status) &&
        (!opts.department || (r.department ?? "No department") === opts.department) &&
        (!q || r.employee.toLowerCase().includes(q) || (r.employeeName ?? "").toLowerCase().includes(q)),
    )
    .sort(compareRows(opts.sort));
  const start = (opts.page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), total: rows.length, page: opts.page, pageSize: PAGE_SIZE };
}

/** Filters for the attendance record list; every field is optional, so the default is all records. */
export type AttendanceQuery = {
  company: string;
  /** Inclusive date range; unset means all dates. */
  from?: string;
  to?: string;
  /** A Shift Type name, or NO_SHIFT for records without a shift. */
  shift?: string;
  status?: string;
  /** Only records flagged late entry or early exit. */
  flag?: "late" | "early";
  department?: string;
  q?: string;
};

function queryFilters(a: AttendanceQuery, docstatus = 1) {
  const filters: Filter[] = [companyFilter(a.company), ["docstatus", "=", docstatus]];
  if (a.from && a.to) {
    filters.push(a.from === a.to ? ["attendance_date", "=", a.from] : ["attendance_date", "between", [a.from, a.to]]);
  }
  // "is not set" also matches empty strings, which ERPNext leaves on some records
  if (a.shift) filters.push(a.shift === NO_SHIFT ? ["shift", "is", "not set"] : ["shift", "=", a.shift]);
  if (a.status) filters.push(["status", "=", a.status]);
  if (a.flag) filters.push([a.flag === "late" ? "late_entry" : "early_exit", "=", 1]);
  if (a.department) {
    filters.push(a.department === NO_DEPARTMENT ? ["department", "is", "not set"] : ["department", "=", a.department]);
  }
  return { filters, orFilters: searchFilters(a.q, ["employee", "employee_name"]) };
}

export type AttendanceRecord = Omit<AttendanceRow, "status"> & {
  id: string;
  date: string;
  status: AttendanceStatus;
};

/** One page of submitted Attendance records, newest first unless another sort is given. */
export async function getAttendanceRecords(
  a: AttendanceQuery,
  page: number,
  sort: AttendanceSort = "newest",
): Promise<Page<AttendanceRecord>> {
  const { filters, orFilters } = queryFilters(a);
  const [rows, total] = await Promise.all([
    getList(
      "Attendance",
      {
        fields: ["name", "attendance_date", "employee", "employee_name", "department", "status", "shift", "leave_type",
          "in_time", "out_time", "late_entry", "early_exit"],
        filters,
        orFilters,
        orderBy: (ATTENDANCE_SORTS.find((s) => s.value === sort) ?? ATTENDANCE_SORTS[0]).orderBy,
        start: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      "attendance records",
    ),
    count("Attendance", filters, "attendance records", orFilters),
  ]);
  return {
    rows: rows.map((r) => ({
      id: str(r.name) ?? "",
      date: str(r.attendance_date) ?? "",
      employee: str(r.employee) ?? "",
      employeeName: str(r.employee_name),
      department: str(r.department),
      status: (str(r.status) ?? "Absent") as AttendanceStatus,
      shift: str(r.shift),
      leaveType: str(r.leave_type),
      inTime: str(r.in_time),
      outTime: str(r.out_time),
      lateEntry: bool(r.late_entry),
      earlyExit: bool(r.early_exit),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

type Breakdown = { group: string; counts: Record<string, number>; total: number };

/** Status counts plus shift and department breakdowns for the filtered records, in one grouped query. */
export async function getAttendanceSummary(a: AttendanceQuery) {
  const { filters, orFilters } = queryFilters(a);
  const [rows, drafts] = await Promise.all([
    getList(
      "Attendance",
      {
        fields: ["status", "shift", "department", aggField("count(name)", "n"), aggField("sum(late_entry)", "late"),
          aggField("sum(early_exit)", "early")],
        filters,
        orFilters,
        groupBy: "status, shift, department",
        limit: 0,
      },
      "attendance summary",
    ),
    count("Attendance", queryFilters(a, 0).filters, "draft attendance", orFilters),
  ]);

  const counts: Record<string, number> = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0]));
  const byShift = new Map<string, Record<string, number>>();
  const byDepartment = new Map<string, Record<string, number>>();
  const add = (m: Map<string, Record<string, number>>, key: string, status: string, n: number) => {
    const c = m.get(key) ?? {};
    c[status] = (c[status] ?? 0) + n;
    m.set(key, c);
  };
  let total = 0;
  let late = 0;
  let earlyExit = 0;
  for (const r of rows) {
    const status = str(r.status) ?? "Absent";
    const n = num(r.n) ?? 0;
    total += n;
    late += num(r.late) ?? 0;
    earlyExit += num(r.early) ?? 0;
    counts[status] = (counts[status] ?? 0) + n;
    add(byShift, str(r.shift) ?? NO_SHIFT, status, n);
    add(byDepartment, str(r.department) ?? NO_DEPARTMENT, status, n);
  }
  const sorted = (m: Map<string, Record<string, number>>): Breakdown[] =>
    [...m.entries()]
      .map(([group, c]) => ({ group, counts: c, total: Object.values(c).reduce((x, y) => x + y, 0) }))
      .sort((x, y) => y.total - x.total);

  return { total, counts, late, earlyExit, drafts, byShift: sorted(byShift), byDepartment: sorted(byDepartment) };
}

export type AttendanceSummary = Awaited<ReturnType<typeof getAttendanceSummary>>;

/** Departments that appear on submitted attendance, for the department filter. */
export const getAttendanceDepartments = cache(async (company: string): Promise<string[]> => {
  const rows = await getList(
    "Attendance",
    {
      fields: ["department"],
      filters: [companyFilter(company), ["docstatus", "=", 1]],
      groupBy: "department",
      orderBy: "department asc",
      limit: 0,
    },
    "attendance departments",
  );
  const names = rows.map((r) => str(r.department));
  return [...names.filter((d): d is string => !!d), ...(names.some((d) => !d) ? [NO_DEPARTMENT] : [])];
});

/** Date of the most recent submitted attendance, or null when there is none. */
export const getLatestAttendanceDate = cache(async (company: string): Promise<string | null> => {
  const rows = await getList(
    "Attendance",
    {
      fields: ["attendance_date"],
      filters: [companyFilter(company), ["docstatus", "=", 1]],
      orderBy: "attendance_date desc",
      limit: 1,
    },
    "latest attendance",
  );
  return str(rows[0]?.attendance_date);
});

/** Submitted attendance per day and status from `from` to `to`, with the other filters applied. */
export async function getAttendanceTrend(a: AttendanceQuery, from: string, to: string) {
  const { filters, orFilters } = queryFilters({ ...a, from, to });
  const rows = await getList(
    "Attendance",
    {
      fields: ["attendance_date", "status", aggField("count(name)", "n")],
      filters,
      orFilters,
      groupBy: "attendance_date, status",
      limit: 0,
    },
    "attendance trend",
  );
  const days = daysBetween(from, to) + 1;
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const series = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, dates.map(() => 0)]),
  ) as Record<AttendanceStatus, number[]>;
  for (const r of rows) {
    const d = str(r.attendance_date);
    const s = str(r.status) as AttendanceStatus | null;
    const i = d ? dates.indexOf(d) : -1;
    if (i >= 0 && s && s in series) series[s][i] += num(r.n) ?? 0;
  }
  return { dates, series };
}
