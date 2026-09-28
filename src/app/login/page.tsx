import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  let host = "";
  try {
    host = new URL(getConfig().erpBaseUrl).host;
  } catch {
    /* configuration errors surface on submit */
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <span className="inline-flex rounded bg-white px-3 py-2 ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset from ERPNext */}
            <img src="/nsa-logo.jpeg" alt="NSA Group of Companies" width={148} height={48} />
          </span>
        </div>
        <div className="rounded-md border border-line bg-surface p-6 shadow-card">
          <h1 className="text-[18px] font-semibold text-ink">Management dashboard</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Sign in with your ERPNext account{host ? ` (${host})` : ""}. You will see the sections your ERPNext
            role allows.
          </p>
          <LoginForm next={next ?? ""} />
        </div>
      </div>
    </div>
  );
}
