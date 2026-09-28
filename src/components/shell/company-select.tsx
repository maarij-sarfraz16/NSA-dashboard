"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function CompanySelect({ companies, current }: { companies: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (companies.length <= 1) {
    return <span className="text-[12.5px] font-medium text-ink-2">{current}</span>;
  }
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
      <span className="sr-only">Company</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          // switching company resets section filters and pagination
          const qs = new URLSearchParams();
          qs.set("company", e.target.value);
          const period = searchParams.get("period");
          if (period) qs.set("period", period);
          startTransition(() => router.push(`${pathname}?${qs}`));
        }}
        className="h-8 max-w-64 rounded border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:border-line-strong"
      >
        {companies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
