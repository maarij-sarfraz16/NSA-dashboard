"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Section } from "@/lib/auth/session-token";

type Item = { href: string; label: string; section?: Section };

const ITEMS: Item[] = [
  { href: "/", label: "Overview" },
  { href: "/sales", label: "Sales", section: "sales" },
  { href: "/purchase", label: "Purchase", section: "purchase" },
  { href: "/manufacturing", label: "Manufacturing", section: "manufacturing" },
  { href: "/attendance", label: "Attendance", section: "attendance" },
  { href: "/payroll", label: "Payroll", section: "payroll" },
];

function NavLinks({ sections, onNavigate }: { sections: Section[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  const suffix = company ? `?company=${encodeURIComponent(company)}` : "";

  return (
    <nav aria-label="Main">
      <ul className="space-y-1.5">
        {ITEMS.filter((i) => !i.section || sections.includes(i.section)).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={`${item.href}${suffix}`}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`relative block rounded-md px-3 py-2 text-[14px] transition-colors ${
                  active
                    ? "bg-nav-active font-medium text-nav-ink-strong before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[#4f86d1]"
                    : "text-nav-ink hover:bg-nav-active/60 hover:text-nav-ink-strong"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center rounded bg-white px-2 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset from ERPNext */}
      <img src="/nsa-logo.jpeg" alt="NSA Group of Companies" width={96} height={31} className="h-[31px] w-[96px]" />
    </span>
  );
}

export function Sidebar({ sections, footer }: { sections: Section[]; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-nav-line bg-nav px-4 py-2.5 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded border border-nav-line px-3 py-1.5 text-[13px] text-nav-ink-strong"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b border-nav-line bg-nav px-3 pb-4 pt-3 lg:hidden">
          <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
          <div className="mt-5 border-t border-nav-line pt-4">{footer}</div>
        </div>
      )}

      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-nav-line bg-nav lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Logo />
          <p className="mt-3 text-[12px] font-medium tracking-[0.02em] text-nav-ink">Management dashboard</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks sections={sections} />
        </div>
        <div className="border-t border-nav-line px-4 py-4">{footer}</div>
      </aside>
    </>
  );
}
