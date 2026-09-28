import type { ReactNode } from "react";
import { canView, requireSession } from "@/lib/auth/session";
import type { Section, Session } from "@/lib/auth/session-token";
import { attempt } from "@/lib/data/shared";
import { getScope, param, type Scope, type SearchParams } from "@/lib/data/scope";
import { resolvePeriod, PERIOD_OPTIONS, type Period } from "@/lib/period";
import { formatDate } from "@/lib/format";
import type { FilterField } from "@/components/ui/filters";
import { ErrorState, NoAccess } from "@/components/ui/states";
import { PageBody, PageHeader } from "./page-header";

type Guarded =
  | { ok: true; session: Session; scope: Scope; period: Period }
  | { ok: false; node: ReactNode };

/**
 * Common page preamble: session + section access, then company/time zone/period
 * resolved against ERPNext. Any failure renders a full-page state instead of data.
 */
export async function guardPage(title: string, section: Section | null, sp: SearchParams): Promise<Guarded> {
  const session = await requireSession();
  if (section && !canView(session, section)) {
    return {
      ok: false,
      node: (
        <>
          <PageHeader title={title} />
          <PageBody>
            <NoAccess section={title} />
          </PageBody>
        </>
      ),
    };
  }
  const result = await attempt(async () => {
    const scope = await getScope(param(sp, "company"));
    const period = await resolvePeriod(
      { period: param(sp, "period"), from: param(sp, "from"), to: param(sp, "to") },
      scope.today,
    );
    return { scope, period };
  });
  if (!result.ok) {
    return {
      ok: false,
      node: (
        <>
          <PageHeader title={title} />
          <PageBody>
            <ErrorState error={result.error} />
          </PageBody>
        </>
      ),
    };
  }
  return { ok: true, session, ...result.data };
}

export function periodField(period: Period, today: string): FilterField {
  return {
    kind: "period",
    name: "period",
    label: "Period",
    defaultValue: "mtd",
    options: PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
    from: period.from,
    to: period.to,
    max: today,
  };
}

export function periodSubtitle(period: Period, company: string) {
  const range = period.from === period.to ? formatDate(period.from) : `${formatDate(period.from)} – ${formatDate(period.to)}`;
  return `${company} · ${period.label}, ${range}`;
}
