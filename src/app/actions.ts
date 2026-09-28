"use server";

import { redirect } from "next/navigation";
import { LoginError, loginWithErp } from "@/lib/auth/erp-login";
import { endSession, startSession } from "@/lib/auth/session";
import { toErrorInfo } from "@/lib/erp/errors";

export type LoginState = { error?: string; username?: string };

/** Only allow redirects to local paths after sign-in. */
function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your ERPNext username and password.", username };

  try {
    const result = await loginWithErp(username, password);
    await startSession(result);
  } catch (err) {
    if (err instanceof LoginError) return { error: err.message, username };
    const info = toErrorInfo(err);
    return { error: `${info.title}. ${info.message}`, username };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
