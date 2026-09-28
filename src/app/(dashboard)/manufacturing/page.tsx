import type { Metadata } from "next";
import { Suspense } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { guardPage, periodField, periodSubtitle } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { DocLink } from "@/components/ui/doc-link";
import { Filters } from "@/components/ui/filters";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Flag, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/ui/states";
import {
  getCompletionTrend,
  getManufacturingSummary,
  getWorkOrders,
  WO_STATUSES,
} from "@/lib/data/manufacturing";
import { pageParam, param, periodParams, type SearchParams } from "@/lib/data/scope";
import { attempt } from "@/lib/data/shared";
import { formatDateTime, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import type { Period } from "@/lib/period";

export const metadata: Metadata = { title: "Manufacturing" };

type Props = { searchParams: Promise<SearchParams> };

export default async function ManufacturingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Manufacturing", "manufacturing", sp);
  if (!g.ok) return g.node;
  const { scope, period } = g;
  const company = scope.company.name;

  const status = param(sp, "status");
  const q = param(sp, "q");
  const page = pageParam(sp);
  const params = { company: param(sp, "company"), ...periodParams(sp), status, q };

  return (
    <>
      <PageHeader title="Manufacturing" subtitle={periodSubtitle(period, company)} scope={scope}>
        <Filters fields={[periodField(period, scope.today)]} />
      </PageHeader>
      <PageBody>
        <Suspense fallback={<KpiSkeleton />}>
          <ManufacturingKpis company={company} period={period} now={scope.fetchedAt} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Work orders completed by month" />}>
          <CompletionTrend company={company} today={scope.today} />
        </Suspense>
        <Panel flush id="work-orders" title="Work orders" description="Planned end dates are in the ERPNext system time zone">
          <div className="border-b border-line px-4 py-3">
            <Filters
              fields={[
                { kind: "search", name: "q", placeholder: "Search order, item or sales order" },
                {
                  kind: "select",
                  name: "status",
                  label: "Status",
                  defaultValue: "active",
                  options: [
                    { value: "active", label: "Active (not started / in process)" },
                    { value: "overdue", label: "Overdue" },
                    { value: "all", label: "All" },
                    ...WO_STATUSES.map((s) => ({ value: s, label: s })),
                  ],
                },
              ]}
            />
          </div>
          <Suspense key={`${status}-${q}-${page}`} fallback={<div className="skeleton m-4 h-64" />}>
            <WorkOrdersTable company={company} now={scope.fetchedAt} opts={{ status, q, page }} params={params} />
          </Suspense>
        </Panel>
      </PageBody>
    </>
  );
}

async function ManufacturingKpis({ company, period, now }: { company: string; period: Period; now: string }) {
  const r = await attempt(() => getManufacturingSummary(company, period, now));
  if (!r.ok) return <ErrorState error={r.error} />;
  const { statusCounts: c, completedInPeriod, overdue } = r.data;
  const link = (status: string) =>
    `/manufacturing?${new URLSearchParams({ company, status })}#work-orders`;
  return (
    <KpiGrid>
      <Kpi
        label="In process"
        value={formatNumber(c["In Process"] ?? 0)}
        sub={`${formatNumber(c["Stopped"] ?? 0)} stopped`}
        href={link("In Process")}
      />
      <Kpi
        label="Not started"
        value={formatNumber(c["Not Started"] ?? 0)}
        sub={`${formatNumber(c["Draft"] ?? 0)} still in draft`}
        href={link("Not Started")}
      />
      <Kpi
        label="Overdue"
        tone={overdue > 0 ? "bad" : undefined}
        value={formatNumber(overdue)}
        sub="Active orders past their planned end date"
        href={link("overdue")}
      />
      <Kpi
        label="Completed"
        value={formatNumber(completedInPeriod)}
        sub={`Work orders finished, ${period.label.toLowerCase()}`}
      />
    </KpiGrid>
  );
}

async function CompletionTrend({ company, today }: { company: string; today: string }) {
  const r = await attempt(() => getCompletionTrend(company, today));
  return (
    <Panel title="Work orders completed by month" description="By actual end date, last 12 months">
      {r.ok ? (
        <ColumnChart
          caption="Work orders completed by month"
          labels={r.data.months.map((m) => formatMonth(m, true))}
          tooltipLabels={r.data.months.map((m) => formatMonth(m))}
          series={[{ name: "Completed", values: r.data.values, slot: 1 }]}
          format={{ kind: "number" }}
          height={200}
        />
      ) : (
        <ErrorState error={r.error} compact />
      )}
    </Panel>
  );
}

async function WorkOrdersTable({
  company,
  now,
  opts,
  params,
}: {
  company: string;
  now: string;
  opts: { status?: string; q?: string; page: number };
  params: Record<string, string | undefined>;
}) {
  const r = await attempt(() => getWorkOrders(company, opts, now));
  if (!r.ok) return <div className="p-4"><ErrorState error={r.error} compact /></div>;
  return (
    <>
      <DataTable
        caption="Work orders"
        rows={r.data.rows}
        rowKey={(w) => w.name}
        empty={<EmptyState title="No work orders match these filters" />}
        columns={[
          { key: "name", header: "Work order", cell: (w) => <DocLink doctype="Work Order" name={w.name} /> },
          {
            key: "item",
            header: "Item",
            cell: (w) => (
              <>
                <span className="block">{w.itemName ?? w.item ?? "—"}</span>
                {w.itemName && w.item && w.itemName !== w.item && (
                  <span className="block text-[12px] text-ink-3">{w.item}</span>
                )}
              </>
            ),
          },
          {
            key: "progress",
            header: "Produced / planned",
            align: "right",
            cell: (w) => (
              <>
                {formatNumber(w.produced, 2)} / {formatNumber(w.qty, 2)} {w.uom ?? ""}
                <span className="block text-[12px] text-ink-3">
                  {w.qty ? formatPercent(((w.produced ?? 0) / w.qty) * 100) : "—"}
                </span>
              </>
            ),
          },
          {
            key: "end",
            header: "Planned end",
            hideBelow: "md",
            className: "whitespace-nowrap",
            cell: (w) => (
              <>
                {formatDateTime(w.plannedEnd)}
                {w.overdue && <Flag>Overdue</Flag>}
              </>
            ),
          },
          { key: "so", header: "Sales order", hideBelow: "lg", cell: (w) => w.salesOrder ?? "—" },
          { key: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
        ]}
      />
      <Pagination
        page={r.data.page}
        pageSize={r.data.pageSize}
        total={r.data.total}
        pathname="/manufacturing"
        params={params}
      />
    </>
  );
}
