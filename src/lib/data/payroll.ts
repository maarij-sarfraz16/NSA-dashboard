import "server-only";

import { cache } from "react";
import { lastMonths, monthEnd, companyFilter } from "@/lib/erp/context";
import { getList, num, str, type Filter } from "@/lib/erp/query";
import { monthlySums } from "./scope";
import { PAGE_SIZE, type Page } from "./shared";

export type SlipRow = {
  name: string;
  employee: string | null;
  employeeName: string | null;
  department: string | null;
  designation: string | null;
  paymentDays: number | null;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  status: string | null;
  submitted: boolean;
};

/** Most recent payroll month ("YYYY-MM") with a submitted salary slip, or null. */
export const getLatestPayrollMonth = cache(async function getLatestPayrollMonth(company: string): Promise<string | null> {
  const rows = await getList(
    "Salary Slip",
    {
      fields: ["start_date"],
      filters: [companyFilter(company), ["docstatus", "=", 1]],
      orderBy: "start_date desc",
      limit: 1,
    },
    "latest payroll month",
  );
  return str(rows[0]?.start_date)?.slice(0, 7) ?? null;
});

/**
 * Salary slips whose period starts in `month`. Totals use submitted slips only
 * (company currency); drafts are counted separately.
 */
export const getPayrollMonth = cache(async function getPayrollMonth(company: string, month: string) {
  const from = `${month}-01`;
  const filters: Filter[] = [
    companyFilter(company),
    ["docstatus", "<", 2],
    ["start_date", "between", [from, monthEnd(from)]],
  ];
  const rows = await getList(
    "Salary Slip",
    {
      fields: ["name", "employee", "employee_name", "department", "designation", "payment_days", "base_gross_pay",
        "base_total_deduction", "base_net_pay", "status", "docstatus"],
      filters,
      orderBy: "employee_name asc",
      limit: 0,
    },
    "salary slips",
  );
  const slips: SlipRow[] = rows.map((r) => ({
    name: str(r.name) ?? "",
    employee: str(r.employee),
    employeeName: str(r.employee_name),
    department: str(r.department),
    designation: str(r.designation),
    paymentDays: num(r.payment_days),
    gross: num(r.base_gross_pay),
    deductions: num(r.base_total_deduction),
    net: num(r.base_net_pay),
    status: str(r.status),
    submitted: num(r.docstatus) === 1,
  }));

  const submitted = slips.filter((s) => s.submitted);
  const sum = (k: "gross" | "deductions" | "net") => submitted.reduce((a, s) => a + (s[k] ?? 0), 0);

  const depts = new Map<string, { employees: number; gross: number; net: number }>();
  for (const s of submitted) {
    const key = s.department ?? "No department";
    const d = depts.get(key) ?? { employees: 0, gross: 0, net: 0 };
    d.employees += 1;
    d.gross += s.gross ?? 0;
    d.net += s.net ?? 0;
    depts.set(key, d);
  }

  return {
    month,
    slips,
    submittedCount: submitted.length,
    draftCount: slips.length - submitted.length,
    withheldCount: submitted.filter((s) => s.status === "Withheld").length,
    gross: sum("gross"),
    deductions: sum("deductions"),
    net: sum("net"),
    byDepartment: [...depts.entries()]
      .map(([department, d]) => ({ department, ...d }))
      .sort((a, b) => b.net - a.net),
  };
});

export type PayrollMonth = Awaited<ReturnType<typeof getPayrollMonth>>;

export function filterSlips(
  data: PayrollMonth,
  opts: { department?: string; status?: string; q?: string; page: number },
): Page<SlipRow> {
  const q = opts.q?.toLowerCase();
  const rows = data.slips.filter(
    (s) =>
      (!opts.department || (s.department ?? "No department") === opts.department) &&
      (!opts.status || s.status === opts.status) &&
      (!q ||
        (s.employee ?? "").toLowerCase().includes(q) ||
        (s.employeeName ?? "").toLowerCase().includes(q) ||
        (s.designation ?? "").toLowerCase().includes(q)),
  );
  const start = (opts.page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), total: rows.length, page: opts.page, pageSize: PAGE_SIZE };
}

/** Submitted net pay per payroll month (by slip start date), company currency. */
export async function getPayrollTrend(company: string, today: string, months = 12) {
  const keys = lastMonths(today, months);
  const [net, gross] = await Promise.all([
    monthlySums("Salary Slip", "start_date", "sum(base_net_pay)", [companyFilter(company), ["docstatus", "=", 1]], keys, "monthly payroll"),
    monthlySums("Salary Slip", "start_date", "sum(base_gross_pay)", [companyFilter(company), ["docstatus", "=", 1]], keys, "monthly payroll"),
  ]);
  return { months: keys, net, gross };
}
