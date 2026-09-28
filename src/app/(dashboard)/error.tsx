"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-5 py-4 text-[13px]">
        <p className="font-semibold text-bad">This page could not be loaded</p>
        <p className="mt-1 text-ink-2">
          Something went wrong while loading data from ERPNext. No figures are shown until the data loads
          successfully.
          {error.digest && <span className="text-ink-3"> Reference: {error.digest}</span>}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-3 h-8 rounded border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
