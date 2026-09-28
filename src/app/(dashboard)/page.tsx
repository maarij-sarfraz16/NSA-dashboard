import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ColumnChart, type ChartSeries } from "@/components/charts/column-chart";
import { guardPage, periodField, periodSubtitle } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Filters } from "@/components/ui/filters";
import { Kpi } from "@/components/ui/kpi";
import { OtherCurrencies } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, PanelSkeleton, TileSkeleton } from "@/components/ui/states";
import type { Section, Session } from "@/lib/auth/session-token";
import { getAttendanceDay, NOT_MARKED } from "@/lib/data/attendance";
import { getManufacturingSummary } from "@/lib/data/manufacturing";
import { getLatestPayrollMonth, getPayrollMonth } from "@/lib/data/payroll";
import { getLetterOfCredit, getPurchaseSummary, getPurchaseTrend } from "@/lib/data/purchase";
import { getSalesSummary, getSalesTrend } from "@/lib/data/sales";
import type { Scope, SearchParams } from "@/lib/data/scope";
import { attempt, splitByCurrency } from "@/lib/data/shared";
import type { ErrorInfo } from "@/lib/erp/errors";
import { formatMoney, formatMoneyCompact, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import type { Period } from "@/lib/period";

type Props = { searchParams: Promise<SearchParams> };

export default async function OverviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Overview", null, sp);
  if (!g.ok) return g.node;
  const { scope, period, session } = g;
  const can = (s: Section) => session.sections.includes(s);
  const q = `?company=${encodeURIComponent(scope.company.name)}`;

  if (session.sections.length === 0) {
    return (
      <>
        <PageHeader title="Overview" scope={scope} />
        <PageBody>
          <Panel>
            <EmptyState title="No sections available">
              Your ERPNext role does not allow reading sales, purchase, manufacturing, attendance or payroll data.
              Ask an ERPNext administrator for access, then sign in again.
            </EmptyState>
          </Panel>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" subtitle={periodSubtitle(period, scope.company.name)} scope={scope}>
        <Filters fields={[periodField(period, scope.today)]} />
      </PageHeader>
      <PageBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {can("sales") && (
            <Suspense fallback={<><TileSkeleton /><TileSkeleton /></>}>
              <SalesTiles scope={scope} period={period} href={`/sales${q}`} />
            </Suspense>
          )}
          {can("purchase") && (
            <Suspense fallback={<><TileSkeleton /><TileSkeleton /></>}>
              <PurchaseTiles scope={scope} period={period} href={`/purchase${q}`} />
            </Suspense>
          )}
          {can("manufacturing") && (
            <Suspense fallback={<TileSkeleton />}>
              <ManufacturingTile scope={scope} period={period} href={`/manufacturing${q}`} />
            </Suspense>
          )}
          {can("attendance") && (
            <Suspense fallback={<TileSkeleton />}>
              <AttendanceTile scope={scope} href={`/attendance${q}`} />
            </Suspense>
          )}
          {can("payroll") && (
            <Suspense fallback={<TileSkeleton />}>
              <PayrollTile scope={scope} href={`/payroll${q}`} />
            </Suspense>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {(can("sales") || can("purchase")) && (
            <div className="xl:col-span-2">
              <Suspense fallback={<PanelSkeleton title="Sales and purchases by month" />}>
                <TradeTrend scope={scope} session={session} />
              </Suspense>
            </div>
          )}
          <Suspense fallback={<PanelSkeleton title="Needs attention" />}>
            <Attention scope={scope} period={period} session={session} q={q} />
          </Suspense>
        </div>
      </PageBody>
    </>
  );
}

/** A tile-sized error so one failing module doesn't hide the rest. */
function TileError({ label, error }: { label: string; error: ErrorInfo }) {
  return (
    <div className="rounded-md border border-bad/30 bg-bad-soft px-4 py-3.5 text-[12.5px]" role="alert">
      <p className="font-medium text-ink-2">{label}</p>
      <p className="mt-1 font-semibold text-bad">{error.title}</p>
      <p className="mt-0.5 text-ink-2">{error.message}</p>
    </div>
  );
}

async function SalesTiles({ scope, period, href }: { scope: Scope; period: Period; href: string }) {
  const cur = scope.company.currency;
  const r = await attempt(() => getSalesSummary(scope.company.name, period, scope.today));
  if (!r.ok) return <TileError label="Sales" error={r.error} />;
  const rec = splitByCurrency(r.data.receivables, cur);
  const overdue = splitByCurrency(r.data.overdue, cur);
  return (
    <>
      <Kpi
        href={href}
        label="Net sales invoiced"
        value={formatMoneyCompact(r.data.invoiced.total, cur)}
        title={formatMoney(r.data.invoiced.total, cur)}
        delta={
          r.data.previousInvoiced && period.previous
            ? {
                current: r.data.invoiced.total,
                previous: r.data.previousInvoiced.total,
                label: `vs ${period.previous.label}`,
              }
            : null
        }
        sub={`${formatNumber(r.data.invoiced.count)} invoices`}
      />
      <Kpi
        href={`${href}&view=invoices`}
        label="Receivables outstanding"
        value={formatMoneyCompact(rec.main.amount, cur)}
        title={formatMoney(rec.main.amount, cur)}
        tone={overdue.main.amount > 0 ? "bad" : undefined}
        sub={
          <>
            {formatMoneyCompact(overdue.main.amount, cur)} overdue ({formatNumber(overdue.main.count)} invoices)
            <br />
            <OtherCurrencies others={rec.others} />
          </>
        }
      />
    </>
  );
}

async function PurchaseTiles({ scope, period, href }: { scope: Scope; period: Period; href: string }) {
  const cur = scope.company.currency;
  const r = await attempt(() => getPurchaseSummary(scope.company.name, period, scope.today));
  if (!r.ok) return <TileError label="Purchase" error={r.error} />;
  const pay = splitByCurrency(r.data.payables, cur);
  const overdue = splitByCurrency(r.data.overdue, cur);
  return (
    <>
      <Kpi
        href={href}
        label="Purchase orders placed"
        value={formatMoneyCompact(r.data.ordered.total, cur)}
        title={formatMoney(r.data.ordered.total, cur)}
        delta={
          r.data.previousOrdered && period.previous
            ? {
                current: r.data.ordered.total,
                previous: r.data.previousOrdered.total,
                label: `vs ${period.previous.label}`,
                upIsGood: false,
              }
            : null
        }
        sub={`${formatNumber(r.data.ordered.count)} orders · ${formatNumber(r.data.toReceive)} awaiting receipt`}
      />
      <Kpi
        href={href}
        label="Payables outstanding"
        value={formatMoneyCompact(pay.main.amount, cur)}
        title={formatMoney(pay.main.amount, cur)}
        tone={overdue.main.amount > 0 ? "warn" : undefined}
        sub={
          <>
            {formatMoneyCompact(overdue.main.amount, cur)} overdue ({formatNumber(overdue.main.count)} invoices)
            <br />
            <OtherCurrencies others={pay.others} />
          </>
        }
      />
    </>
  );
}

async function ManufacturingTile({ scope, period, href }: { scope: Scope; period: Period; href: string }) {
  const r = await attempt(() => getManufacturingSummary(scope.company.name, period, scope.fetchedAt));
  if (!r.ok) return <TileError label="Manufacturing" error={r.error} />;
  const c = r.data.statusCounts;
  return (
    <Kpi
      href={href}
      label="Work orders in process"
      value={formatNumber(c["In Process"] ?? 0)}
      tone={r.data.overdue > 0 ? "bad" : undefined}
      sub={`${formatNumber(r.data.overdue)} overdue · ${formatNumber(c["Not Started"] ?? 0)} not started · ${formatNumber(
        r.data.completedInPeriod,
      )} completed in period`}
    />
  );
}

async function AttendanceTile({ scope, href }: { scope: Scope; href: string }) {
  const r = await attempt(() => getAttendanceDay(scope.company.name, scope.today));
  if (!r.ok) return <TileError label="Attendance today" error={r.error} />;
  const c = r.data.counts;
  const present = (c["Present"] ?? 0) + (c["Work From Home"] ?? 0) + (c["Half Day"] ?? 0);
  return (
    <Kpi
      href={href}
      label="Present today"
      value={
        <>
          {formatNumber(present)}
          <span className="text-[15px] font-medium text-ink-3"> / {formatNumber(r.data.activeEmployees)}</span>
        </>
      }
      tone={(c[NOT_MARKED] ?? 0) > 0 ? "warn" : undefined}
      sub={`${r.data.activeEmployees ? formatPercent((present / r.data.activeEmployees) * 100) : "—"} of active employees · ${formatNumber(
        c["Absent"] ?? 0,
      )} absent · ${formatNumber(c[NOT_MARKED] ?? 0)} not marked`}
    />
  );
}

async function PayrollTile({ scope, href }: { scope: Scope; href: string }) {
  const cur = scope.company.currency;
  const r = await attempt(async () => {
    const month = await getLatestPayrollMonth(scope.company.name);
    return month ? getPayrollMonth(scope.company.name, month) : null;
  });
  if (!r.ok) return <TileError label="Payroll" error={r.error} />;
  if (!r.data) return <Kpi href={href} label="Latest payroll" value="—" sub="No submitted salary slips yet" />;
  return (
    <Kpi
      href={href}
      label={`Net pay, ${formatMonth(r.data.month)}`}
      value={formatMoneyCompact(r.data.net, cur)}
      title={formatMoney(r.data.net, cur)}
      tone={r.data.draftCount > 0 ? "warn" : undefined}
      sub={`${formatNumber(r.data.submittedCount)} employees paid${
        r.data.draftCount ? ` · ${formatNumber(r.data.draftCount)} slips still draft` : ""
      }`}
    />
  );
}

async function TradeTrend({ scope, session }: { scope: Scope; session: Session }) {
  const cur = scope.company.currency;
  const company = scope.company.name;
  const r = await attempt(() =>
    Promise.all([
      session.sections.includes("sales") ? getSalesTrend(company, scope.today) : null,
      session.sections.includes("purchase") ? getPurchaseTrend(company, scope.today) : null,
    ]),
  );
  const both = session.sections.includes("sales") && session.sections.includes("purchase");
  const title = both ? "Sales and purchases by month" : session.sections.includes("sales") ? "Sales by month" : "Purchases by month";
  if (!r.ok) {
    return (
      <Panel title={title}>
        <ErrorState error={r.error} compact />
      </Panel>
    );
  }
  const [sales, purchases] = r.data;
  const months = (sales ?? purchases)!.months;
  const series: ChartSeries[] = [];
  if (sales) series.push({ name: "Net sales invoiced", values: sales.values, slot: 1 });
  if (purchases) series.push({ name: "Purchases invoiced", values: purchases.values, slot: 2 });
  return (
    <Panel title={title} description={`Submitted invoices, last 12 months, ${cur}`}>
      <ColumnChart
        caption={title}
        labels={months.map((m) => formatMonth(m, true))}
        tooltipLabels={months.map((m) => formatMonth(m))}
        series={series}
        format={{ kind: "money", currency: cur }}
        height={240}
      />
    </Panel>
  );
}

type AttentionItem = { label: string; detail: string; href: string; severity: "bad" | "warn" } | { error: ErrorInfo; label: string };

async function Attention({ scope, period, session, q }: { scope: Scope; period: Period; session: Session; q: string }) {
  const can = (s: Section) => session.sections.includes(s);
  const company = scope.company.name;
  const cur = scope.company.currency;
  const checks: Promise<AttentionItem[]>[] = [];

  const run = async (label: string, fn: () => Promise<AttentionItem[]>): Promise<AttentionItem[]> => {
    const r = await attempt(fn);
    return r.ok ? r.data : [{ label, error: r.error }];
  };

  if (can("sales")) {
    checks.push(
      run("Overdue receivables", async () => {
        const o = splitByCurrency((await getSalesSummary(company, period, scope.today)).overdue, cur).main;
        return o.count
          ? [{ label: `${formatNumber(o.count)} overdue sales invoices`, detail: `${formatMoney(o.amount, cur)} past due`, href: `/sales${q}&view=invoices&status=Overdue`, severity: "bad" }]
          : [];
      }),
    );
  }
  if (can("purchase")) {
    checks.push(
      run("Overdue payables", async () => {
        const o = splitByCurrency((await getPurchaseSummary(company, period, scope.today)).overdue, cur).main;
        return o.count
          ? [{ label: `${formatNumber(o.count)} overdue purchase invoices`, detail: `${formatMoney(o.amount, cur)} past due`, href: `/purchase${q}`, severity: "warn" }]
          : [];
      }),
      run("Letters of credit", async () => {
        const lc = await getLetterOfCredit(company, scope.today);
        return lc.expiring.length
          ? [{ label: `${formatNumber(lc.expiring.length)} letters of credit expire within ${lc.withinDays} days`, detail: "Open LCs from NSA Import", href: `/purchase${q}`, severity: "warn" }]
          : [];
      }),
    );
  }
  if (can("manufacturing")) {
    checks.push(
      run("Overdue work orders", async () => {
        const m = await getManufacturingSummary(company, period, scope.fetchedAt);
        return m.overdue
          ? [{ label: `${formatNumber(m.overdue)} work orders past planned end`, detail: "Not started or in process", href: `/manufacturing${q}&status=overdue`, severity: "bad" }]
          : [];
      }),
    );
  }
  if (can("attendance")) {
    checks.push(
      run("Attendance", async () => {
        const d = await getAttendanceDay(company, scope.today);
        const n = d.counts[NOT_MARKED] ?? 0;
        return n
          ? [{ label: `${formatNumber(n)} employees without attendance today`, detail: "Active employees with no submitted record", href: `/attendance${q}&status=${encodeURIComponent(NOT_MARKED)}`, severity: "warn" }]
          : [];
      }),
    );
  }
  if (can("payroll")) {
    checks.push(
      run("Payroll", async () => {
        const month = await getLatestPayrollMonth(company);
        if (!month) return [];
        const p = await getPayrollMonth(company, month);
        return p.draftCount
          ? [{ label: `${formatNumber(p.draftCount)} draft salary slips for ${formatMonth(month)}`, detail: "Payroll not final", href: `/payroll${q}&month=${month}`, severity: "warn" }]
          : [];
      }),
    );
  }

  const items = (await Promise.all(checks)).flat();
  const content: ReactNode =
    items.length === 0 ? (
      <EmptyState title="Nothing needs attention">No overdue or pending items were found in ERPNext.</EmptyState>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((item, i) =>
          "error" in item ? (
            <li key={i} className="px-4 py-3 text-[12.5px]">
              <p className="font-medium text-ink-2">{item.label}</p>
              <p className="text-bad">{item.error.title}: {item.error.message}</p>
            </li>
          ) : (
            <li key={i}>
              <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                <span
                  aria-hidden
                  className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${item.severity === "bad" ? "bg-bad" : "bg-warn"}`}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">
                    <span className="sr-only">{item.severity === "bad" ? "Critical: " : "Warning: "}</span>
                    {item.label}
                  </span>
                  <span className="block text-[12px] text-ink-3">{item.detail}</span>
                </span>
              </Link>
            </li>
          ),
        )}
      </ul>
    );
  return (
    <Panel flush title="Needs attention" description="Exceptions found in ERPNext right now">
      {content}
    </Panel>
  );
}
