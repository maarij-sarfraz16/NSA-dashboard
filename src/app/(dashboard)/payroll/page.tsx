import type { Metadata } from "next";
import { Suspense } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { guardPage } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { DocLink } from "@/components/ui/doc-link";
import { Filters } from "@/components/ui/filters";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/ui/states";
import {
  filterSlips,
  getLatestPayrollMonth,
  getPayrollMonth,
  getPayrollTrend,
  type PayrollMonth,
} from "@/lib/data/payroll";
import { pageParam, param, type SearchParams } from "@/lib/data/scope";
import { attempt } from "@/lib/data/shared";
import { formatAmount, formatMoney, formatMoneyCompact, formatMonth, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Payroll" };

type Props = { searchParams: Promise<SearchParams> };

export default async function PayrollPage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Payroll", "payroll", sp);
  if (!g.ok) return g.node;
  const { scope } = g;
  const company = scope.company.name;
  const currency = scope.company.currency;
  const currentMonth = scope.today.slice(0, 7);

  const requested = param(sp, "month");
  let month: string | null = requested && /^\d{4}-\d{2}$/.test(requested) && requested <= currentMonth ? requested : null;
  let latestError = null;
  if (!month) {
    const latest = await attempt(() => getLatestPayrollMonth(company));
    if (latest.ok) month = latest.data;
    else latestError = latest.error;
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle={`${company} · ${month ? `Payroll for ${formatMonth(month)}` : "No submitted payroll yet"}`}
        scope={scope}
      >
        <Filters
          fields={[{ kind: "month", name: "month", label: "Payroll month", max: currentMonth, defaultValue: month ?? "" }]}
          resetKeys={["page", "department", "status", "q"]}
        />
      </PageHeader>
      <PageBody>
        {latestError ? (
          <ErrorState error={latestError} />
        ) : !month ? (
          <Panel>
            <EmptyState title="No submitted salary slips">
              ERPNext has no submitted salary slips for {company}. Totals appear here once payroll is processed.
            </EmptyState>
          </Panel>
        ) : (
          <Suspense key={month} fallback={<KpiSkeleton />}>
            <PayrollForMonth company={company} currency={currency} month={month} sp={sp} />
          </Suspense>
        )}
        <Suspense fallback={<PanelSkeleton title="Payroll by month" />}>
          <PayrollTrend company={company} currency={currency} today={scope.today} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function PayrollForMonth({
  company,
  currency,
  month,
  sp,
}: {
  company: string;
  currency: string;
  month: string;
  sp: SearchParams;
}) {
  const r = await attempt(() => getPayrollMonth(company, month));
  if (!r.ok) return <ErrorState error={r.error} />;
  const d = r.data;

  if (d.slips.length === 0) {
    return (
      <Panel>
        <EmptyState title={`No salary slips for ${formatMonth(month)}`}>
          Pick another month, or process payroll for this month in ERPNext.
        </EmptyState>
      </Panel>
    );
  }

  const notes = [
    d.draftCount > 0 && `${formatNumber(d.draftCount)} draft slips not included`,
    d.withheldCount > 0 && `${formatNumber(d.withheldCount)} withheld`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {d.draftCount > 0 && (
        <p className="rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-ink-2">
          <span className="font-semibold text-warn">Payroll not final.</span> {formatNumber(d.draftCount)} salary
          slips for {formatMonth(month)} are still in draft. Totals below include submitted slips only.
        </p>
      )}
      <KpiGrid>
        <Kpi
          label="Net pay"
          value={formatMoneyCompact(d.net, currency)}
          title={formatMoney(d.net, currency)}
          sub="Submitted salary slips"
        />
        <Kpi
          label="Gross pay"
          value={formatMoneyCompact(d.gross, currency)}
          title={formatMoney(d.gross, currency)}
          sub={d.submittedCount ? `Average ${formatMoneyCompact(d.gross / d.submittedCount, currency)} per employee` : undefined}
        />
        <Kpi
          label="Deductions"
          value={formatMoneyCompact(d.deductions, currency)}
          title={formatMoney(d.deductions, currency)}
          sub={d.gross ? `${formatPercent((d.deductions / d.gross) * 100, 1)} of gross` : undefined}
        />
        <Kpi
          label="Employees paid"
          value={formatNumber(d.submittedCount)}
          tone={d.draftCount > 0 ? "warn" : undefined}
          sub={notes.length ? notes.join(" · ") : "All slips submitted"}
        />
      </KpiGrid>
      <DepartmentPayroll data={d} currency={currency} />
      <SlipsTable data={d} currency={currency} sp={sp} />
    </div>
  );
}

function DepartmentPayroll({ data, currency }: { data: PayrollMonth; currency: string }) {
  return (
    <Panel flush title="By department" description="Submitted slips">
      <div className="max-h-96 overflow-auto">
        <DataTable
          caption="Payroll by department"
          rows={data.byDepartment}
          rowKey={(r) => r.department}
          empty={<EmptyState title="No submitted slips yet" />}
          columns={[
            { key: "dept", header: "Department", cell: (r) => r.department },
            { key: "emp", header: "Employees", align: "right", cell: (r) => formatNumber(r.employees) },
            { key: "gross", header: `Gross (${currency})`, align: "right", hideBelow: "sm", cell: (r) => formatAmount(r.gross) },
            { key: "net", header: `Net (${currency})`, align: "right", cell: (r) => formatAmount(r.net) },
            {
              key: "share",
              header: "Share of net",
              align: "right",
              hideBelow: "md",
              cell: (r) => (data.net ? formatPercent((r.net / data.net) * 100, 1) : "—"),
            },
          ]}
        />
      </div>
    </Panel>
  );
}

function SlipsTable({ data, currency, sp }: { data: PayrollMonth; currency: string; sp: SearchParams }) {
  const department = param(sp, "department");
  const status = param(sp, "status");
  const q = param(sp, "q");
  const page = filterSlips(data, { department, status, q, page: pageParam(sp) });
  const departments = [...new Set(data.slips.map((s) => s.department ?? "No department"))].sort();
  const statuses = [...new Set(data.slips.map((s) => s.status).filter((s): s is string => !!s))].sort();

  return (
    <Panel flush title="Salary slips">
      <div className="border-b border-line px-4 py-3">
        <Filters
          fields={[
            { kind: "search", name: "q", placeholder: "Search employee or designation" },
            {
              kind: "select",
              name: "department",
              label: "Department",
              defaultValue: "",
              options: [{ value: "", label: "All" }, ...departments.map((d) => ({ value: d, label: d }))],
            },
            {
              kind: "select",
              name: "status",
              label: "Status",
              defaultValue: "",
              options: [{ value: "", label: "All" }, ...statuses.map((s) => ({ value: s, label: s }))],
            },
          ]}
        />
      </div>
      <DataTable
        caption="Salary slips"
        rows={page.rows}
        rowKey={(s) => s.name}
        empty={<EmptyState title="No salary slips match these filters" />}
        columns={[
          { key: "slip", header: "Slip", hideBelow: "lg", cell: (s) => <DocLink doctype="Salary Slip" name={s.name} /> },
          {
            key: "employee",
            header: "Employee",
            cell: (s) => (
              <>
                <span className="block">{s.employeeName ?? s.employee ?? "—"}</span>
                <span className="block text-[12px] text-ink-3">{s.designation ?? s.employee}</span>
              </>
            ),
          },
          { key: "dept", header: "Department", hideBelow: "md", cell: (s) => s.department ?? "—" },
          { key: "days", header: "Paid days", align: "right", hideBelow: "md", cell: (s) => formatNumber(s.paymentDays, 1) },
          { key: "gross", header: `Gross (${currency})`, align: "right", hideBelow: "sm", cell: (s) => formatAmount(s.gross) },
          { key: "ded", header: "Deductions", align: "right", hideBelow: "lg", cell: (s) => formatAmount(s.deductions) },
          { key: "net", header: `Net (${currency})`, align: "right", cell: (s) => formatAmount(s.net) },
          { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
        ]}
      />
      <Pagination
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        pathname="/payroll"
        params={{ company: param(sp, "company"), month: param(sp, "month"), department, status, q }}
      />
    </Panel>
  );
}

async function PayrollTrend({ company, currency, today }: { company: string; currency: string; today: string }) {
  const r = await attempt(() => getPayrollTrend(company, today));
  return (
    <Panel title="Payroll by month" description={`Submitted salary slips by payroll month, last 12 months, ${currency}`}>
      {r.ok ? (
        <ColumnChart
          caption="Gross and net pay by month"
          labels={r.data.months.map((m) => formatMonth(m, true))}
          tooltipLabels={r.data.months.map((m) => formatMonth(m))}
          series={[
            { name: "Gross pay", values: r.data.gross, slot: 1 },
            { name: "Net pay", values: r.data.net, slot: 2 },
          ]}
          format={{ kind: "money", currency }}
        />
      ) : (
        <ErrorState error={r.error} compact />
      )}
    </Panel>
  );
}
