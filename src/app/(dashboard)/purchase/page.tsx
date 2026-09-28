import type { Metadata } from "next";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { guardPage, periodField, periodSubtitle } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { DocLink } from "@/components/ui/doc-link";
import { Filters } from "@/components/ui/filters";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { OtherCurrencies } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { Flag, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/ui/states";
import {
  getLetterOfCredit,
  getPurchaseOrders,
  getPurchaseSummary,
  getPurchaseTrend,
  getPurchaseTypeSplit,
  getTopSuppliers,
  PO_STATUSES,
} from "@/lib/data/purchase";
import { pageParam, param, periodParams, type SearchParams } from "@/lib/data/scope";
import { attempt, splitByCurrency } from "@/lib/data/shared";
import { daysBetween } from "@/lib/erp/context";
import {
  formatAmount,
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatMonth,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { Period } from "@/lib/period";

export const metadata: Metadata = { title: "Purchase" };

type Props = { searchParams: Promise<SearchParams> };

export default async function PurchasePage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Purchase", "purchase", sp);
  if (!g.ok) return g.node;
  const { scope, period } = g;
  const company = scope.company.name;
  const currency = scope.company.currency;

  return (
    <>
      <PageHeader title="Purchase" subtitle={periodSubtitle(period, company)} scope={scope}>
        <Filters fields={[periodField(period, scope.today)]} />
      </PageHeader>
      <PageBody>
        <Suspense fallback={<KpiSkeleton />}>
          <PurchaseKpis company={company} currency={currency} period={period} today={scope.today} />
        </Suspense>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Suspense fallback={<PanelSkeleton title="Purchases by month" />}>
              <PurchaseTrend company={company} currency={currency} today={scope.today} />
            </Suspense>
          </div>
          <div className="space-y-5">
            <Suspense fallback={<PanelSkeleton title="Local vs import" height={80} />}>
              <TypeSplit company={company} currency={currency} period={period} />
            </Suspense>
            <Suspense fallback={<PanelSkeleton title="Top suppliers" />}>
              <TopSuppliers company={company} currency={currency} period={period} />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<PanelSkeleton title="Letters of credit" height={120} />}>
          <LettersOfCredit company={company} today={scope.today} />
        </Suspense>
        <PurchaseOrders sp={sp} company={company} currency={currency} today={scope.today} />
      </PageBody>
    </>
  );
}

async function PurchaseKpis({
  company,
  currency,
  period,
  today,
}: {
  company: string;
  currency: string;
  period: Period;
  today: string;
}) {
  const r = await attempt(() => getPurchaseSummary(company, period, today));
  if (!r.ok) return <ErrorState error={r.error} />;
  const { ordered, previousOrdered, invoiced, toReceive } = r.data;
  const payables = splitByCurrency(r.data.payables, currency);
  const overdue = splitByCurrency(r.data.overdue, currency);
  return (
    <KpiGrid>
      <Kpi
        label="Purchase orders placed"
        value={formatMoneyCompact(ordered.total, currency)}
        title={formatMoney(ordered.total, currency)}
        delta={
          previousOrdered && period.previous
            ? {
                current: ordered.total,
                previous: previousOrdered.total,
                label: `vs ${period.previous.label}`,
                upIsGood: false,
              }
            : null
        }
        sub={`${formatNumber(ordered.count)} submitted orders · ${formatNumber(toReceive)} awaiting receipt`}
      />
      <Kpi
        label="Purchases invoiced"
        value={formatMoneyCompact(invoiced.total, currency)}
        title={formatMoney(invoiced.total, currency)}
        sub={`${formatNumber(invoiced.count)} submitted purchase invoices`}
      />
      <Kpi
        label="Payables outstanding"
        value={formatMoneyCompact(payables.main.amount, currency)}
        title={formatMoney(payables.main.amount, currency)}
        sub={
          <>
            {formatNumber(payables.main.count)} invoices, all dates
            <br />
            <OtherCurrencies others={payables.others} />
          </>
        }
      />
      <Kpi
        label="Overdue payables"
        tone={overdue.main.amount > 0 ? "warn" : undefined}
        value={formatMoneyCompact(overdue.main.amount, currency)}
        title={formatMoney(overdue.main.amount, currency)}
        sub={
          <>
            {formatNumber(overdue.main.count)} invoices past due date
            <br />
            <OtherCurrencies others={overdue.others} />
          </>
        }
      />
    </KpiGrid>
  );
}

async function PurchaseTrend({ company, currency, today }: { company: string; currency: string; today: string }) {
  const r = await attempt(() => getPurchaseTrend(company, today));
  return (
    <Panel title="Purchases by month" description={`Submitted purchase invoices, last 12 months, ${currency}`}>
      {r.ok ? (
        <ColumnChart
          caption="Purchases invoiced by month"
          labels={r.data.months.map((m) => formatMonth(m, true))}
          tooltipLabels={r.data.months.map((m) => formatMonth(m))}
          series={[{ name: "Purchases", values: r.data.values, slot: 1 }]}
          format={{ kind: "money", currency }}
        />
      ) : (
        <ErrorState error={r.error} compact />
      )}
    </Panel>
  );
}

async function TypeSplit({ company, currency, period }: { company: string; currency: string; period: Period }) {
  const r = await attempt(() => getPurchaseTypeSplit(company, period));
  return (
    <Panel title="Local vs import" description={`Purchase orders, ${period.label.toLowerCase()}`}>
      {!r.ok ? (
        <ErrorState error={r.error} compact />
      ) : r.data.length === 0 ? (
        <EmptyState title="No purchase orders in this period" />
      ) : (
        <BarList
          items={r.data.map((d) => ({ key: d.type, label: d.type, total: d.total, count: d.count }))}
          currency={currency}
          countLabel="POs"
        />
      )}
    </Panel>
  );
}

async function TopSuppliers({ company, currency, period }: { company: string; currency: string; period: Period }) {
  const r = await attempt(() => getTopSuppliers(company, period, 6));
  return (
    <Panel title="Top suppliers" description={`Purchase order value, ${period.label.toLowerCase()}`}>
      {!r.ok ? (
        <ErrorState error={r.error} compact />
      ) : r.data.length === 0 ? (
        <EmptyState title="No purchase orders in this period" />
      ) : (
        <BarList items={r.data} currency={currency} countLabel="POs" />
      )}
    </Panel>
  );
}

async function LettersOfCredit({ company, today }: { company: string; today: string }) {
  const r = await attempt(() => getLetterOfCredit(company, today));
  if (!r.ok) {
    return (
      <Panel title="Letters of credit">
        <ErrorState error={r.error} compact />
      </Panel>
    );
  }
  const { openBalances, expiring, withinDays } = r.data;
  return (
    <Panel
      flush
      title="Letters of credit"
      description="Open LCs (opened, amended or partially shipped) from NSA Import"
      actions={
        <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-right">
          {openBalances.length === 0 ? (
            <span className="text-[12.5px] text-ink-3">No open letters of credit</span>
          ) : (
            openBalances.map((b) => (
              <div key={b.currency}>
                <p className="text-[11.5px] text-ink-3">
                  Open balance · {formatNumber(b.count)} LCs
                </p>
                <p className="tabular text-[15px] font-semibold text-ink" title={formatMoney(b.amount, b.currency)}>
                  {formatMoneyCompact(b.amount, b.currency)}
                </p>
              </div>
            ))
          )}
        </div>
      }
    >
      <p className="border-b border-line px-4 py-2 text-[12.5px] font-medium text-ink-2">
        Expiring in the next {withinDays} days ({formatNumber(expiring.length)})
      </p>
      <DataTable
        caption={`Letters of credit expiring within ${withinDays} days`}
        rows={expiring}
        rowKey={(l) => l.name}
        empty={<EmptyState title={`No open letters of credit expire in the next ${withinDays} days`} />}
        columns={[
          { key: "name", header: "LC", cell: (l) => <DocLink doctype="Letter of Credit" name={l.name} /> },
          { key: "no", header: "LC no.", cell: (l) => l.lcNo ?? "—", hideBelow: "md" },
          { key: "supplier", header: "Supplier", cell: (l) => l.supplier ?? "—" },
          { key: "bank", header: "Issuing bank", cell: (l) => l.bank ?? "—", hideBelow: "lg" },
          {
            key: "balance",
            header: "Balance",
            align: "right",
            cell: (l) => formatMoney(l.balance, l.currency ?? ""),
          },
          {
            key: "expiry",
            header: "Expires",
            className: "whitespace-nowrap",
            cell: (l) => {
              const days = l.expiry ? daysBetween(today, l.expiry) : null;
              return (
                <>
                  {formatDate(l.expiry)}
                  {days !== null && (
                    <Flag tone={days <= 7 ? "bad" : "warn"}>{days === 0 ? "today" : `${days} d`}</Flag>
                  )}
                </>
              );
            },
          },
          { key: "status", header: "Status", cell: (l) => <StatusBadge status={l.status} />, hideBelow: "sm" },
        ]}
      />
    </Panel>
  );
}

function PurchaseOrders({
  sp,
  company,
  currency,
  today,
}: {
  sp: SearchParams;
  company: string;
  currency: string;
  today: string;
}) {
  const status = param(sp, "status");
  const type = param(sp, "type");
  const q = param(sp, "q");
  const page = pageParam(sp);
  const params = { company: param(sp, "company"), ...periodParams(sp), status, type, q };

  return (
    <Panel flush title="Purchase orders">
      <div className="border-b border-line px-4 py-3">
        <Filters
          fields={[
            { kind: "search", name: "q", placeholder: "Search number or supplier" },
            {
              kind: "select",
              name: "status",
              label: "Status",
              defaultValue: "open",
              options: [
                { value: "open", label: "Open" },
                { value: "all", label: "All" },
                ...PO_STATUSES.map((s) => ({ value: s, label: s })),
              ],
            },
            {
              kind: "select",
              name: "type",
              label: "Type",
              defaultValue: "",
              options: [
                { value: "", label: "All" },
                { value: "Local", label: "Local" },
                { value: "Import", label: "Import" },
              ],
            },
          ]}
        />
      </div>
      <Suspense key={`${status}-${type}-${q}-${page}`} fallback={<div className="skeleton m-4 h-64" />}>
        <PurchaseOrdersTable
          company={company}
          currency={currency}
          today={today}
          opts={{ status, type, q, page }}
          params={params}
        />
      </Suspense>
    </Panel>
  );
}

async function PurchaseOrdersTable({
  company,
  currency,
  today,
  opts,
  params,
}: {
  company: string;
  currency: string;
  today: string;
  opts: { status?: string; type?: string; q?: string; page: number };
  params: Record<string, string | undefined>;
}) {
  const r = await attempt(() => getPurchaseOrders(company, opts, today));
  if (!r.ok) return <div className="p-4"><ErrorState error={r.error} compact /></div>;
  return (
    <>
      <DataTable
        caption="Purchase orders"
        rows={r.data.rows}
        rowKey={(row) => row.name}
        empty={<EmptyState title="No purchase orders match these filters" />}
        columns={[
          { key: "name", header: "Order", cell: (o) => <DocLink doctype="Purchase Order" name={o.name} /> },
          { key: "date", header: "Date", cell: (o) => formatDate(o.date), hideBelow: "md", className: "whitespace-nowrap" },
          { key: "supplier", header: "Supplier", cell: (o) => o.supplier ?? "—" },
          { key: "type", header: "Type", cell: (o) => o.purchaseType ?? "—", hideBelow: "sm" },
          {
            key: "required",
            header: "Required by",
            hideBelow: "lg",
            className: "whitespace-nowrap",
            cell: (o) => (
              <>
                {formatDate(o.requiredBy)}
                {o.late && <Flag>Late</Flag>}
              </>
            ),
          },
          { key: "total", header: `Amount (${currency})`, align: "right", cell: (o) => formatAmount(o.total) },
          { key: "received", header: "Received", align: "right", hideBelow: "sm", cell: (o) => formatPercent(o.perReceived) },
          { key: "billed", header: "Billed", align: "right", hideBelow: "md", cell: (o) => formatPercent(o.perBilled) },
          { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
        ]}
      />
      <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} pathname="/purchase" params={params} />
    </>
  );
}
