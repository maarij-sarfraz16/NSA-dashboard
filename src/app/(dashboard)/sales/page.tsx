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
import { Tabs } from "@/components/ui/tabs";
import {
  getSalesInvoices,
  getSalesOrders,
  getSalesSummary,
  getSalesTrend,
  getTopCustomers,
  SI_STATUSES,
  SO_STATUSES,
} from "@/lib/data/sales";
import { pageParam, param, periodParams, type SearchParams } from "@/lib/data/scope";
import { attempt, splitByCurrency } from "@/lib/data/shared";
import { formatAmount, formatDate, formatMoney, formatMoneyCompact, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import type { Period } from "@/lib/period";

export const metadata: Metadata = { title: "Sales" };

type Props = { searchParams: Promise<SearchParams> };

export default async function SalesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Sales", "sales", sp);
  if (!g.ok) return g.node;
  const { scope, period } = g;
  const company = scope.company.name;
  const currency = scope.company.currency;

  return (
    <>
      <PageHeader title="Sales" subtitle={periodSubtitle(period, company)} scope={scope}>
        <Filters fields={[periodField(period, scope.today)]} resetKeys={["page"]} />
      </PageHeader>
      <PageBody>
        <Suspense fallback={<KpiSkeleton />}>
          <SalesKpis company={company} currency={currency} period={period} today={scope.today} />
        </Suspense>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Suspense fallback={<PanelSkeleton title="Net sales by month" />}>
              <SalesTrend company={company} currency={currency} today={scope.today} />
            </Suspense>
          </div>
          <Suspense fallback={<PanelSkeleton title="Top customers" />}>
            <TopCustomers company={company} currency={currency} period={period} />
          </Suspense>
        </div>
        <SalesDocuments sp={sp} company={company} currency={currency} today={scope.today} />
      </PageBody>
    </>
  );
}

async function SalesKpis({
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
  const r = await attempt(() => getSalesSummary(company, period, today));
  if (!r.ok) return <ErrorState error={r.error} />;
  const { invoiced, previousInvoiced, orders } = r.data;
  const receivables = splitByCurrency(r.data.receivables, currency);
  const overdue = splitByCurrency(r.data.overdue, currency);
  return (
    <KpiGrid>
      <Kpi
        label="Net sales invoiced"
        value={formatMoneyCompact(invoiced.total, currency)}
        title={formatMoney(invoiced.total, currency)}
        delta={
          previousInvoiced && period.previous
            ? { current: invoiced.total, previous: previousInvoiced.total, label: `vs ${period.previous.label}` }
            : null
        }
        sub={`${formatNumber(invoiced.count)} submitted invoices, returns netted`}
      />
      <Kpi
        label="Sales orders booked"
        value={formatMoneyCompact(orders.total, currency)}
        title={formatMoney(orders.total, currency)}
        sub={`${formatNumber(orders.count)} submitted orders`}
      />
      <Kpi
        label="Receivables outstanding"
        value={formatMoneyCompact(receivables.main.amount, currency)}
        title={formatMoney(receivables.main.amount, currency)}
        sub={
          <>
            {formatNumber(receivables.main.count)} invoices, all dates
            <br />
            <OtherCurrencies others={receivables.others} />
          </>
        }
      />
      <Kpi
        label="Overdue receivables"
        tone={overdue.main.amount > 0 ? "bad" : undefined}
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

async function SalesTrend({ company, currency, today }: { company: string; currency: string; today: string }) {
  const r = await attempt(() => getSalesTrend(company, today));
  return (
    <Panel title="Net sales by month" description={`Submitted sales invoices, last 12 months, ${currency}`}>
      {r.ok ? (
        <ColumnChart
          caption="Net sales invoiced by month"
          labels={r.data.months.map((m) => formatMonth(m, true))}
          tooltipLabels={r.data.months.map((m) => formatMonth(m))}
          series={[{ name: "Net sales", values: r.data.values, slot: 1 }]}
          format={{ kind: "money", currency }}
        />
      ) : (
        <ErrorState error={r.error} compact />
      )}
    </Panel>
  );
}

async function TopCustomers({ company, currency, period }: { company: string; currency: string; period: Period }) {
  const r = await attempt(() => getTopCustomers(company, period));
  return (
    <Panel title="Top customers" description={`Net invoiced, ${period.label.toLowerCase()}`}>
      {!r.ok ? (
        <ErrorState error={r.error} compact />
      ) : r.data.length === 0 ? (
        <EmptyState title="No invoices in this period" />
      ) : (
        <BarList items={r.data} currency={currency} countLabel="inv." />
      )}
    </Panel>
  );
}

function SalesDocuments({
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
  const view = param(sp, "view") === "invoices" ? "invoices" : "orders";
  const base = { company: param(sp, "company"), ...periodParams(sp) };
  const status = param(sp, "status");
  const q = param(sp, "q");
  const page = pageParam(sp);
  const statusOptions =
    view === "orders"
      ? [{ value: "open", label: "Open" }, { value: "all", label: "All" }, ...SO_STATUSES.map((s) => ({ value: s, label: s }))]
      : [{ value: "unpaid", label: "Outstanding" }, { value: "all", label: "All" }, ...SI_STATUSES.map((s) => ({ value: s, label: s }))];

  return (
    <section className="rounded-md border border-line bg-surface shadow-card">
      <Tabs
        tabs={[
          { value: "orders", label: "Sales orders" },
          { value: "invoices", label: "Sales invoices" },
        ]}
        active={view}
        pathname="/sales"
        params={base}
      />
      <div className="border-b border-line px-4 py-3">
        <Filters
          fields={[
            { kind: "search", name: "q", placeholder: "Search number or customer" },
            {
              kind: "select",
              name: "status",
              label: "Status",
              defaultValue: view === "orders" ? "open" : "unpaid",
              options: statusOptions,
            },
          ]}
        />
      </div>
      <Suspense key={`${view}-${status}-${q}-${page}`} fallback={<div className="skeleton m-4 h-64" />}>
        {view === "orders" ? (
          <OrdersTable company={company} currency={currency} today={today} status={status} q={q} page={page} params={{ ...base, status, q }} />
        ) : (
          <InvoicesTable company={company} currency={currency} status={status} q={q} page={page} params={{ ...base, view, status, q }} />
        )}
      </Suspense>
    </section>
  );
}

async function OrdersTable({
  company,
  currency,
  today,
  status,
  q,
  page,
  params,
}: {
  company: string;
  currency: string;
  today: string;
  status?: string;
  q?: string;
  page: number;
  params: Record<string, string | undefined>;
}) {
  const r = await attempt(() => getSalesOrders(company, { status, q, page }, today));
  if (!r.ok) return <div className="p-4"><ErrorState error={r.error} compact /></div>;
  return (
    <>
      <DataTable
        caption="Sales orders"
        rows={r.data.rows}
        rowKey={(row) => row.name}
        empty={<EmptyState title="No sales orders match these filters" />}
        columns={[
          { key: "name", header: "Order", cell: (o) => <DocLink doctype="Sales Order" name={o.name} /> },
          { key: "date", header: "Date", cell: (o) => formatDate(o.date), hideBelow: "md", className: "whitespace-nowrap" },
          { key: "customer", header: "Customer", cell: (o) => o.customer ?? "—" },
          {
            key: "delivery",
            header: "Delivery by",
            className: "whitespace-nowrap",
            hideBelow: "lg",
            cell: (o) => (
              <>
                {formatDate(o.deliveryDate)}
                {o.late && <Flag>Late</Flag>}
              </>
            ),
          },
          { key: "total", header: `Amount (${currency})`, align: "right", cell: (o) => formatAmount(o.total) },
          { key: "delivered", header: "Delivered", align: "right", hideBelow: "sm", cell: (o) => formatPercent(o.perDelivered) },
          { key: "billed", header: "Billed", align: "right", hideBelow: "sm", cell: (o) => formatPercent(o.perBilled) },
          { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
        ]}
      />
      <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} pathname="/sales" params={params} />
    </>
  );
}

async function InvoicesTable({
  company,
  currency,
  status,
  q,
  page,
  params,
}: {
  company: string;
  currency: string;
  status?: string;
  q?: string;
  page: number;
  params: Record<string, string | undefined>;
}) {
  const r = await attempt(() => getSalesInvoices(company, { status, q, page }));
  if (!r.ok) return <div className="p-4"><ErrorState error={r.error} compact /></div>;
  return (
    <>
      <DataTable
        caption="Sales invoices"
        rows={r.data.rows}
        rowKey={(row) => row.name}
        empty={<EmptyState title="No sales invoices match these filters" />}
        columns={[
          { key: "name", header: "Invoice", cell: (i) => <DocLink doctype="Sales Invoice" name={i.name} /> },
          { key: "date", header: "Date", cell: (i) => formatDate(i.date), hideBelow: "md", className: "whitespace-nowrap" },
          { key: "customer", header: "Customer", cell: (i) => i.customer ?? "—" },
          { key: "due", header: "Due", cell: (i) => formatDate(i.dueDate), hideBelow: "lg", className: "whitespace-nowrap" },
          { key: "total", header: `Amount (${currency})`, align: "right", cell: (i) => formatAmount(i.total) },
          {
            key: "outstanding",
            header: "Outstanding",
            align: "right",
            hideBelow: "sm",
            cell: (i) => (i.outstanding ? formatMoney(i.outstanding, i.currency ?? "") : "—"),
          },
          { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
        ]}
      />
      <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} pathname="/sales" params={params} />
    </>
  );
}
