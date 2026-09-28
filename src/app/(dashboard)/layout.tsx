import { cookies } from "next/headers";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { Sidebar } from "@/components/shell/nav";
import { ThemeToggle, type Theme } from "@/components/shell/theme-toggle";
import { requireSession } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const cookieTheme = (await cookies()).get("theme")?.value;
  const theme: Theme | null = cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : null;

  const footer = (
    <div className="space-y-2">
      <div className="min-w-0 px-2">
        <p className="truncate text-[13px] font-medium text-nav-ink-strong">{session.fullName}</p>
        <p className="truncate text-[11.5px] text-nav-ink">{session.user}</p>
      </div>
      <div className="flex items-center justify-between">
        <ThemeToggle initial={theme} />
        <form action={signOut}>
          <button
            type="submit"
            className="rounded px-2 py-1 text-[12px] text-nav-ink hover:bg-nav-active hover:text-nav-ink-strong"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="lg:flex">
      <Suspense>
        <Sidebar sections={session.sections} footer={footer} />
      </Suspense>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
