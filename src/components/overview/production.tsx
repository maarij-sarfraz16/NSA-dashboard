import { type ReactNode } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DocLink } from "@/components/ui/doc-link";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  getDailyConsumption,
  getProductionDay,
  getRawMaterialPurchases,
  type ProducedItem,
  type ProductionDay,
} from "@/lib/data/production";
import { attempt } from "@/lib/data/shared";
import { formatAmount, formatDate, formatNumber } from "@/lib/format";

const qty = (v: number) => formatNumber(v, 2);

function producedColumns(currency: string): Column<ProducedItem>[] {
  return [
    { key: "item", header: "Item", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", header: "Code", hideBelow: "md", cell: (r) => <span className="text-ink-3">{r.code}</span> },
    { key: "qty", header: "Produced", align: "right", cell: (r) => `${qty(r.qty)} ${r.uom}` },
    { key: "value", header: `Value (${currency})`, align: "right", hideBelow: "sm", cell: (r) => formatAmount(r.value) },
  ];
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <div className="border-b border-line bg-surface-2 px-4 py-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <p className="text-[12px] text-ink-3">{description}</p>
      </div>
      {children}
    </div>
  );
}

export async function ProductionSection({ company, date, currency }: { company: string; date: string; currency: string }) {
  const r = await attempt(() => getProductionDay(company, date));
  if (!r.ok) return <ErrorState error={r.error} />;
  const day: ProductionDay = r.data;
  const total = (rows: ProducedItem[], f: "qty" | "value") => rows.reduce((s, x) => s + x[f], 0);
  const pipeQty = total(day.pipes, "qty");
  const sheetQty = total(day.sheets, "qty");
  const sheetUom = day.sheets[0]?.uom ?? "";

  return (
    <>
      <KpiGrid cols={3}>
        <Kpi label="HDP pipes produced" value={formatNumber(pipeQty, 2)} sub={`${day.pipes.length} sizes · Nos`} />
        <Kpi
          label="HDP sheets produced"
          value={formatNumber(sheetQty, 2)}
          sub={day.sheets.length ? `${day.sheets.length} items · ${sheetUom}` : "No sheet production booked"}
        />
        <Kpi
          label="Production value"
          value={formatAmount(total(day.pipes, "value") + total(day.sheets, "value"))}
          sub={
            day.entries.length ? (
              <>
                {currency} · {day.entries.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ", "}
                    <DocLink doctype="Stock Entry" name={n} />
                  </span>
                ))}
              </>
            ) : (
              `${currency} · no Daily Production entries`
            )
          }
        />
      </KpiGrid>
      <Panel title="Production" description={`Finished goods booked on ${formatDate(date)} via Daily Production entries`} flush>
        <Section title="HDP pipes" description="All pipe sizes produced">
          <DataTable
            caption="HDP pipes produced"
            columns={producedColumns(currency)}
            rows={day.pipes}
            rowKey={(x) => x.code}
            empty={<EmptyState title="No pipes produced on this date" />}
          />
        </Section>
        <Section title="HDP sheets" description="Sheets produced">
          <DataTable
            caption="HDP sheets produced"
            columns={producedColumns(currency)}
            rows={day.sheets}
            rowKey={(x) => x.code}
            empty={<EmptyState title="No sheets produced on this date" />}
          />
        </Section>
      </Panel>
    </>
  );
}

export async function PurchasesPanel({ company, date, currency }: { company: string; date: string; currency: string }) {
  const r = await attempt(() => getRawMaterialPurchases(company, date));
  return (
    <Panel title="Raw material purchases" description={`Raw material received into stock on ${formatDate(date)}`} flush>
      {r.ok ? (
        <DataTable
          caption="Raw material purchases"
          rows={r.data}
          rowKey={(x) => x.code}
          empty={<EmptyState title="No raw material received on this date" />}
          columns={[
            { key: "item", header: "Raw material", cell: (x) => <span className="font-medium">{x.name}</span> },
            { key: "group", header: "Group", hideBelow: "md", cell: (x) => <span className="text-ink-3">{x.group}</span> },
            { key: "qty", header: "Received", align: "right", cell: (x) => `${qty(x.qty)} ${x.uom}` },
            { key: "value", header: `Value (${currency})`, align: "right", hideBelow: "sm", cell: (x) => formatAmount(x.value) },
            {
              key: "docs",
              header: "Receipts",
              hideBelow: "lg",
              cell: (x) =>
                x.receipts.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ", "}
                    <DocLink doctype="GRN" name={n} />
                  </span>
                )),
            },
          ]}
        />
      ) : (
        <div className="p-4">
          <ErrorState error={r.error} compact />
        </div>
      )}
    </Panel>
  );
}

export async function ConsumptionPanel({ company, date, currency }: { company: string; date: string; currency: string }) {
  const r = await attempt(() => getDailyConsumption(company, date));
  const used = r.ok ? r.data.filter((x) => x.consumed > 0).length : 0;
  return (
    <Panel
      title="Daily consumption"
      description={`Raw material drawn from stores on ${formatDate(date)}, with stock on hand at the end of that day`}
      actions={r.ok && <span className="text-[12.5px] text-ink-3">{used} of {r.data.length} materials used</span>}
      flush
    >
      {r.ok ? (
        <DataTable
          caption="Daily raw material consumption"
          rows={r.data}
          rowKey={(x) => x.code}
          empty={<EmptyState title="No raw material items found" />}
          columns={[
            { key: "item", header: "Raw material", cell: (x) => <span className="font-medium">{x.name}</span> },
            { key: "group", header: "Group", hideBelow: "md", cell: (x) => <span className="text-ink-3">{x.group}</span> },
            { key: "used", header: "Consumed", align: "right", cell: (x) => (x.consumed ? `${qty(x.consumed)} ${x.uom}` : <span className="text-ink-3">—</span>) },
            { key: "value", header: `Value (${currency})`, align: "right", hideBelow: "sm", cell: (x) => (x.consumed ? formatAmount(x.consumedValue) : "—") },
            { key: "stock", header: "On hand", align: "right", cell: (x) => `${qty(x.onHand)} ${x.uom}` },
          ]}
        />
      ) : (
        <div className="p-4">
          <ErrorState error={r.error} compact />
        </div>
      )}
    </Panel>
  );
}
