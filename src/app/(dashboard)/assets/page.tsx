import type { Metadata } from "next";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { guardPage } from "@/components/shell/guard";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { DocLink } from "@/components/ui/doc-link";
import { Filters } from "@/components/ui/filters";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Flag, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, KpiSkeleton, PanelSkeleton } from "@/components/ui/states";
import {
  ASSET_STATUSES,
  getAssetActivity,
  getAssetCategories,
  getAssets,
  getAssetsByCategory,
  getAssetsByCompany,
  getAssetsByStatus,
  getAssetSummary,
  getFixedAssetLedger,
} from "@/lib/data/assets";
import { pageParam, param, type SearchParams } from "@/lib/data/scope";
import { attempt } from "@/lib/data/shared";
import { daysBetween } from "@/lib/erp/context";
import { formatAmount, formatDate, formatMoney, formatMoneyCompact, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Assets" };

type Props = { searchParams: Promise<SearchParams> };

export default async function AssetsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const g = await guardPage("Assets", "assets", sp);
  if (!g.ok) return g.node;
  const { scope } = g;
  const company = scope.company.name;
  const currency = scope.company.currency;
  const isGroup = scope.company.isGroup;

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle={isGroup ? `${company} · all subsidiaries combined` : company}
        scope={scope}
      />
      <PageBody>
        <Suspense fallback={<KpiSkeleton />}>
          <AssetKpis company={company} currency={currency} today={scope.today} />
        </Suspense>
        {isGroup && (
          <Suspense fallback={<PanelSkeleton title="By company" height={100} />}>
            <ByCompany company={company} currency={currency} />
          </Suspense>
        )}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Suspense fallback={<PanelSkeleton title="By category" />}>
            <ByCategory company={company} currency={currency} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="By status" />}>
            <ByStatus company={company} currency={currency} />
          </Suspense>
        </div>
        <Suspense fallback={<PanelSkeleton title="Fixed asset ledger" height={120} />}>
          <Ledger company={company} currency={currency} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Maintenance" height={120} />}>
          <Maintenance company={company} currency={currency} today={scope.today} />
        </Suspense>
        <AssetRegister sp={sp} company={company} currency={currency} showCompany={isGroup} />
      </PageBody>
    </>
  );
}

async function AssetKpis({ company, currency, today }: { company: string; currency: string; today: string }) {
  const [s, a] = await Promise.all([
    attempt(() => getAssetSummary(company)),
    attempt(() => getAssetActivity(company, today)),
  ]);
  if (!s.ok) return <ErrorState error={s.error} />;
  const t = s.data;
  return (
    <KpiGrid>
      <Kpi
        label="Assets in service"
        value={formatNumber(t.count)}
        sub={`${formatNumber(t.retired)} sold or scrapped · ${formatNumber(t.maintenance)} in maintenance`}
      />
      <Kpi
        label="Gross purchase value"
        value={formatMoneyCompact(t.gross, currency)}
        title={formatMoney(t.gross, currency)}
        sub="Submitted assets, excluding sold / scrapped"
      />
      <Kpi
        label="Net book value"
        value={formatMoneyCompact(t.book, currency)}
        title={formatMoney(t.book, currency)}
        sub={`${formatMoneyCompact(t.depreciated, currency)} depreciated (${formatPercent(t.gross ? t.depreciated / t.gross : 0)})`}
      />
      <Kpi
        label="Maintenance overdue"
        tone={a.ok && a.data.overdue > 0 ? "warn" : undefined}
        value={a.ok ? formatNumber(a.data.overdue) : "—"}
        sub={
          a.ok
            ? `${formatNumber(a.data.repairs)} repairs · ${formatMoneyCompact(a.data.repairCost, currency)} repair cost`
            : "Could not load maintenance"
        }
      />
    </KpiGrid>
  );
}

async function ByCompany({ company, currency }: { company: string; currency: string }) {
  const r = await attempt(() => getAssetsByCompany(company));
  return (
    <Panel flush title="By company" description="Polymer and Polycam shown separately; select a company above to filter the page">
      {!r.ok ? (
        <div className="p-4"><ErrorState error={r.error} compact /></div>
      ) : (
        <DataTable
          caption="Assets by company"
          rows={r.data}
          rowKey={(c) => c.company}
          empty={<EmptyState title="No assets recorded for any company yet" />}
          columns={[
            { key: "company", header: "Company", cell: (c) => c.company },
            { key: "count", header: "Assets", align: "right", cell: (c) => formatNumber(c.count) },
            { key: "gross", header: `Gross (${currency})`, align: "right", cell: (c) => formatAmount(c.gross) },
            { key: "book", header: `Net book value (${currency})`, align: "right", cell: (c) => formatAmount(c.book) },
          ]}
        />
      )}
    </Panel>
  );
}

async function ByCategory({ company, currency }: { company: string; currency: string }) {
  const r = await attempt(() => getAssetsByCategory(company));
  return (
    <Panel title="By category" description="Net book value of assets in service">
      {!r.ok ? (
        <ErrorState error={r.error} compact />
      ) : r.data.length === 0 ? (
        <EmptyState title="No assets recorded yet" />
      ) : (
        <BarList items={r.data} currency={currency} countLabel="assets" />
      )}
    </Panel>
  );
}

async function ByStatus({ company, currency }: { company: string; currency: string }) {
  const r = await attempt(() => getAssetsByStatus(company));
  return (
    <Panel title="By status" description="Net book value, all submitted assets">
      {!r.ok ? (
        <ErrorState error={r.error} compact />
      ) : r.data.length === 0 ? (
        <EmptyState title="No assets recorded yet" />
      ) : (
        <BarList items={r.data} currency={currency} countLabel="assets" />
      )}
    </Panel>
  );
}

async function Ledger({ company, currency }: { company: string; currency: string }) {
  const r = await attempt(() => getFixedAssetLedger(company));
  const showCompany = new Set(r.ok ? r.data.map((l) => l.company) : []).size > 1;
  return (
    <Panel
      flush
      title="Fixed asset ledger"
      description="General ledger balances on fixed asset, accumulated depreciation and CWIP accounts (debit − credit)"
    >
      {!r.ok ? (
        <div className="p-4"><ErrorState error={r.error} compact /></div>
      ) : (
        <DataTable
          caption="Fixed asset ledger balances"
          rows={r.data}
          rowKey={(l) => l.account}
          empty={<EmptyState title="No postings on fixed asset accounts yet" />}
          columns={[
            { key: "account", header: "Account", cell: (l) => l.account },
            ...(showCompany ? [{ key: "company", header: "Company", hideBelow: "md" as const, cell: (l: (typeof r.data)[number]) => l.company }] : []),
            { key: "type", header: "Type", hideBelow: "sm", cell: (l) => l.type },
            { key: "entries", header: "Entries", align: "right", hideBelow: "sm", cell: (l) => formatNumber(l.entries) },
            { key: "balance", header: `Balance (${currency})`, align: "right", cell: (l) => formatAmount(l.balance) },
          ]}
        />
      )}
    </Panel>
  );
}

async function Maintenance({ company, currency, today }: { company: string; currency: string; today: string }) {
  const r = await attempt(() => getAssetActivity(company, today));
  return (
    <Panel
      flush
      title="Maintenance"
      description={
        r.ok
          ? `${formatNumber(r.data.movements)} asset movements · ${formatNumber(r.data.repairs)} repairs (${formatMoney(r.data.repairCost, currency)})`
          : undefined
      }
    >
      {!r.ok ? (
        <div className="p-4"><ErrorState error={r.error} compact /></div>
      ) : (
        <DataTable
          caption="Planned and overdue maintenance"
          rows={r.data.due}
          rowKey={(m) => m.name}
          empty={<EmptyState title="No planned or overdue maintenance" />}
          columns={[
            { key: "name", header: "Log", cell: (m) => <DocLink doctype="Asset Maintenance Log" name={m.name} /> },
            { key: "asset", header: "Asset", cell: (m) => m.asset ?? "—", hideBelow: "sm" },
            { key: "task", header: "Task", cell: (m) => m.task ?? "—" },
            { key: "assigned", header: "Assigned to", cell: (m) => m.assignedTo ?? "—", hideBelow: "md" },
            {
              key: "due",
              header: "Due",
              className: "whitespace-nowrap",
              cell: (m) => (
                <>
                  {formatDate(m.dueDate)}
                  {m.dueDate && daysBetween(m.dueDate, today) > 0 && <Flag>Overdue</Flag>}
                </>
              ),
            },
            { key: "status", header: "Status", cell: (m) => <StatusBadge status={m.status} /> },
          ]}
        />
      )}
    </Panel>
  );
}

function AssetRegister({
  sp,
  company,
  currency,
  showCompany,
}: {
  sp: SearchParams;
  company: string;
  currency: string;
  showCompany: boolean;
}) {
  const status = param(sp, "status");
  const category = param(sp, "category");
  const q = param(sp, "q");
  const page = pageParam(sp);
  const params = { company: param(sp, "company"), status, category, q };

  return (
    <Panel flush title="Asset register">
      <div className="border-b border-line px-4 py-3">
        <Suspense fallback={<div className="skeleton h-9" />}>
          <RegisterFilters company={company} />
        </Suspense>
      </div>
      <Suspense key={`${status}-${category}-${q}-${page}`} fallback={<div className="skeleton m-4 h-64" />}>
        <RegisterTable
          company={company}
          currency={currency}
          showCompany={showCompany}
          opts={{ status, category, q, page }}
          params={params}
        />
      </Suspense>
    </Panel>
  );
}

async function RegisterFilters({ company }: { company: string }) {
  const r = await attempt(() => getAssetCategories(company));
  return (
    <Filters
      fields={[
        { kind: "search", name: "q", placeholder: "Search asset, category, location or custodian" },
        {
          kind: "select",
          name: "status",
          label: "Status",
          defaultValue: "open",
          options: [
            { value: "open", label: "In service" },
            { value: "all", label: "All" },
            ...ASSET_STATUSES.map((s) => ({ value: s, label: s })),
          ],
        },
        {
          kind: "select",
          name: "category",
          label: "Category",
          defaultValue: "",
          options: [{ value: "", label: "All" }, ...(r.ok ? r.data : []).map((c) => ({ value: c, label: c }))],
        },
      ]}
    />
  );
}

async function RegisterTable({
  company,
  currency,
  showCompany,
  opts,
  params,
}: {
  company: string;
  currency: string;
  showCompany: boolean;
  opts: { status?: string; category?: string; q?: string; page: number };
  params: Record<string, string | undefined>;
}) {
  const r = await attempt(() => getAssets(company, opts));
  if (!r.ok) return <div className="p-4"><ErrorState error={r.error} compact /></div>;
  return (
    <>
      <DataTable
        caption="Asset register"
        rows={r.data.rows}
        rowKey={(a) => a.name}
        empty={<EmptyState title="No assets match these filters" />}
        columns={[
          { key: "name", header: "Asset", cell: (a) => <DocLink doctype="Asset" name={a.name} /> },
          { key: "assetName", header: "Name", cell: (a) => a.assetName ?? "—" },
          ...(showCompany
            ? [{ key: "company", header: "Company", hideBelow: "md" as const, cell: (a: (typeof r.data.rows)[number]) => a.company ?? "—" }]
            : []),
          { key: "category", header: "Category", cell: (a) => a.category ?? "—", hideBelow: "sm" },
          { key: "location", header: "Location", cell: (a) => a.location ?? "—", hideBelow: "lg" },
          { key: "custodian", header: "Custodian", cell: (a) => a.custodian ?? "—", hideBelow: "lg" },
          { key: "purchased", header: "Purchased", cell: (a) => formatDate(a.purchaseDate), hideBelow: "md", className: "whitespace-nowrap" },
          { key: "gross", header: `Gross (${currency})`, align: "right", hideBelow: "sm", cell: (a) => formatAmount(a.gross) },
          { key: "book", header: `Net book (${currency})`, align: "right", cell: (a) => formatAmount(a.book) },
          { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
        ]}
      />
      <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} pathname="/assets" params={params} />
    </>
  );
}
