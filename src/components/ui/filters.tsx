"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type FilterField =
  | { kind: "search"; name: string; placeholder: string }
  | {
      kind: "select";
      name: string;
      label: string;
      options: { value: string; label: string }[];
      defaultValue?: string;
    }
  | {
      kind: "date" | "month";
      name: string;
      label: string;
      max?: string;
      defaultValue?: string;
      /** Params cleared when this one is set, e.g. a day and a month that exclude each other. */
      clears?: string[];
    }
  | {
      /** Preset select; the "custom" option reveals from/to date inputs. */
      kind: "period";
      name: string;
      label: string;
      options: { value: string; label: string }[];
      defaultValue: string;
      /** The resolved range, used to seed the inputs when switching to "custom". */
      from: string;
      to: string;
      max: string;
    };

const control =
  "h-8 rounded border border-line bg-surface px-2.5 text-[13px] text-ink hover:border-line-strong";

/**
 * Filters live in the URL, so every change re-renders on the server against
 * ERPNext (no client-side filtering of stale data) and views are shareable.
 */
export function Filters({ fields, resetKeys = ["page"] }: { fields: FilterField[]; resetKeys?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(name: string, value: string) {
    updateMany({ [name]: value });
  }

  function updateMany(values: Record<string, string>) {
    const qs = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(values)) {
      if (value) qs.set(name, value);
      else qs.delete(name);
    }
    for (const k of resetKeys) qs.delete(k);
    const s = qs.toString();
    startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {fields.map((f) => {
        const current = searchParams.get(f.name) ?? "";
        if (f.kind === "search") {
          return <SearchInput key={f.name} field={f} value={current} onChange={(v) => update(f.name, v)} />;
        }
        if (f.kind === "period") {
          return <PeriodInput key={f.name} field={f} value={current || f.defaultValue} onChange={updateMany} />;
        }
        if (f.kind === "select") {
          return (
            <label key={f.name} className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <span>{f.label}</span>
              <select
                className={control}
                value={current || f.defaultValue || ""}
                onChange={(e) => update(f.name, e.target.value === f.defaultValue ? "" : e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.name} className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <span>{f.label}</span>
            <input
              type={f.kind}
              className={`${control} tabular`}
              value={current || f.defaultValue || ""}
              max={f.max}
              onChange={(e) => {
                const v = e.target.value === f.defaultValue ? "" : e.target.value;
                updateMany({ [f.name]: v, ...(v ? Object.fromEntries((f.clears ?? []).map((k) => [k, ""])) : {}) });
              }}
            />
          </label>
        );
      })}
      <span className="min-w-16 text-[12px] text-ink-3" aria-live="polite">
        {pending ? "Updating…" : ""}
      </span>
    </div>
  );
}

function PeriodInput({
  field,
  value,
  onChange,
}: {
  field: Extract<FilterField, { kind: "period" }>;
  value: string;
  onChange: (values: Record<string, string>) => void;
}) {
  const custom = value === "custom";
  return (
    <>
      <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <span>{field.label}</span>
        <select
          className={control}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") onChange({ [field.name]: v, from: field.from, to: field.to });
            else onChange({ [field.name]: v === field.defaultValue ? "" : v, from: "", to: "" });
          }}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <span>From</span>
            <input
              type="date"
              className={`${control} tabular`}
              value={field.from}
              max={field.to}
              // an emptied or half-typed date keeps the current range
              onChange={(e) => e.target.value && onChange({ from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <span>To</span>
            <input
              type="date"
              className={`${control} tabular`}
              value={field.to}
              min={field.from}
              max={field.max}
              onChange={(e) => e.target.value && onChange({ to: e.target.value })}
            />
          </label>
        </>
      )}
    </>
  );
}

function SearchInput({
  field,
  value,
  onChange,
}: {
  field: { name: string; placeholder: string };
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    // URL changed elsewhere (e.g. back button): follow it
    setPrevValue(value);
    setText(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <input
      type="search"
      aria-label={field.placeholder}
      placeholder={field.placeholder}
      className={`${control} w-full sm:w-64`}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(v.trim()), 350);
      }}
    />
  );
}
