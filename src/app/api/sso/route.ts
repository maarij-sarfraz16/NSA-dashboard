import { NextRequest, NextResponse } from "next/server";
import { loginWithErpSid, LoginError } from "@/lib/auth/erp-login";
import { startSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SSO_TRY_COOKIE = "nsa_sso_try";

/**
 * ERP AUTO-LOGIN
 * User ERPNext mein logged in hai to browser ki `sid` cookie yahan aati hai.
 * Use ERPNext se verify kar ke dashboard ki session bana dete hain — password ki zaroorat nahi.
 * ERPNext login na ho (ya session expire ho) to normal /login page par bhej dete hain.
 */
export async function GET(req: NextRequest) {
  const nextParam = req.nextUrl.searchParams.get("next") || "/";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const toLogin = req.nextUrl.clone();
  toLogin.pathname = "/login";
  toLogin.search = safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : "";

  const sid = req.cookies.get("sid")?.value;
  if (!sid || sid === "Guest") return NextResponse.redirect(toLogin);

  try {
    const result = await loginWithErpSid(sid);
    await startSession(result);

    const target = new URL(safeNext, req.nextUrl.origin);
    const res = NextResponse.redirect(target);
    res.cookies.delete(SSO_TRY_COOKIE);
    return res;
  } catch (err) {
    if (!(err instanceof LoginError)) console.error("ERP auto-login failed:", err);
    else console.warn("ERP auto-login rejected:", err.message);
    return NextResponse.redirect(toLogin);
  }
}