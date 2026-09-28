import type { ReactNode } from "react";
import type { Scope } from "@/lib/data/scope";
import { CompanySelect } from "./company-select";

export function PageHeader({
  title,
  subtitle,
  scope,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  scope?: Scope;
  /** Page-level filters, rendered in a row under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-3 pt-5 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
        {scope && scope.companies.length > 1 && (
          <CompanySelect companies={scope.companies.map((c) => c.name)} current={scope.company.name} />
        )}
      </div>
      {children && (
        <div className="mx-auto max-w-[1440px] px-4 pb-3 sm:px-6 lg:px-8">{children}</div>
      )}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">{children}</div>;
}
