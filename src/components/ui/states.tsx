import type { ErrorInfo } from "@/lib/erp/errors";

const HINTS: Partial<Record<ErrorInfo["kind"], string>> = {
  config: "Set the variables in .env.local (see .env.example) and restart the dashboard.",
  unauthorized:
    "Regenerate the API secret for the dashboard's service user in ERPNext (User → API Access) and update .env.local.",
  forbidden: "Grant the service user's role read access to this DocType in ERPNext (Role Permission Manager).",
  network: "Check that the ERPNext server is running and reachable from the dashboard server.",
  timeout: "ERPNext may be under heavy load. Try refreshing in a moment.",
  rate_limited: "Wait a minute before refreshing again.",
};

/** Shown in place of data when loading fails. Never shows a partial or stale number. */
export function ErrorState({ error, compact = false }: { error: ErrorInfo; compact?: boolean }) {
  const hint = HINTS[error.kind];
  return (
    <div
      role="alert"
      className={`rounded-md border border-bad/30 bg-bad-soft text-[13px] ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
    >
      <p className="font-semibold text-bad">{error.title}</p>
      <p className="mt-0.5 text-ink-2">{error.message}</p>
      {hint && <p className="mt-1 text-ink-3">{hint}</p>}
      <p className="mt-1 text-ink-3">No figures are shown for this section until the data loads successfully.</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[13.5px] font-medium text-ink-2">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-3">{children}</p>}
    </div>
  );
}

export function NoAccess({ section }: { section: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">No access to {section}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">
        Your ERPNext role does not allow reading this data. Ask an ERPNext administrator for access, then sign
        out and sign in again.
      </p>
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function TileSkeleton() {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3.5" aria-busy="true" aria-label="Loading">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-3 h-6 w-32" />
      <SkeletonBlock className="mt-3 h-3 w-40" />
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-md border border-line bg-surface px-4 py-3.5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-6 w-32" />
          <SkeletonBlock className="mt-3 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ height = 240, title }: { height?: number; title?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface" aria-busy="true" aria-label={`Loading ${title ?? ""}`}>
      <div className="border-b border-line px-4 py-3">
        {title ? (
          <p className="text-[14px] font-semibold text-ink">{title}</p>
        ) : (
          <SkeletonBlock className="h-4 w-40" />
        )}
      </div>
      <div className="p-4">
        <div className="skeleton w-full" style={{ height }} />
      </div>
    </div>
  );
}
