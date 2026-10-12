import { NextResponse, type NextRequest } from "next/server";
import { COMPANY_COOKIE, SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";

/** Redirects anyone without a valid dashboard session to the sign-in page. */
export async function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (session) {
    // Filters live in the query string; a full page load (reload, typed URL)
    // starts from the defaults. In-app filter changes are RSC fetches, not documents.
    const isDocumentLoad =
      request.method === "GET" && request.headers.get("sec-fetch-dest") === "document" && !request.headers.has("rsc");
    if (isDocumentLoad && request.nextUrl.search) {
      const url = request.nextUrl.clone();
      const company = url.searchParams.get("company");
      url.search = "";
      const res = NextResponse.redirect(url);
      // a hard navigation must not silently fall back to the group view: keep the chosen company
      if (company) res.cookies.set(COMPANY_COOKIE, company, { path: "/", maxAge: 31536000, sameSite: "lax" });
      return res;
    }
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const res = NextResponse.redirect(url);
  if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|nsa-logo).*)"],
};
