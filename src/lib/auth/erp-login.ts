import "server-only";

import { erpRequest } from "@/lib/erp/client";
import { ErpError } from "@/lib/erp/errors";
import { isAllowedUser, type Section } from "./session-token";

/**
 * The ERPNext DocType a user must be able to read (per their own ERPNext role
 * permissions) to see each dashboard section.
 */
export const SECTION_DOCTYPES: Record<Section, string> = {
  sales: "Sales Invoice",
  purchase: "Purchase Order",
  manufacturing: "Work Order",
  attendance: "Attendance",
  payroll: "Salary Slip",
  assets: "Asset",
};

export class LoginError extends Error {}

type LoginResult = { user: string; fullName: string; sections: Section[] };

function readSid(headers: Headers): string | null {
  for (const cookie of headers.getSetCookie()) {
    const match = /^sid=([^;]+)/.exec(cookie);
    if (match && match[1] !== "Guest") return match[1];
  }
  return null;
}

/**
 * Verifies the user's ERPNext credentials, determines which sections their ERPNext
 * permissions allow, then ends the ERPNext session again. The user's password and
 * ERPNext session are never stored by the dashboard.
 */
export async function loginWithErp(usr: string, pwd: string): Promise<LoginResult> {
  let res;
  try {
    res = await erpRequest("/api/method/login", {}, {
      what: "sign-in",
      method: "POST",
      body: { usr, pwd },
      headers: {},
    });
  } catch (err) {
    if (err instanceof ErpError && (err.kind === "unauthorized" || err.kind === "forbidden")) {
      throw new LoginError(err.detail || "Invalid username or password.");
    }
    if (err instanceof ErpError && err.kind === "rate_limited") {
      throw new LoginError("Too many sign-in attempts. Wait a few minutes and try again.");
    }
    throw err;
  }

  const body = res.json as { message?: string; full_name?: string; verification?: unknown };
  if (body.verification) {
    throw new LoginError(
      "This account uses two-factor authentication, which the dashboard does not support yet.",
    );
  }
  if (body.message === "No App") {
    throw new LoginError("Only ERPNext desk users can sign in to the dashboard.");
  }
  const sid = readSid(res.headers);
  if (!sid) {
    throw new ErpError("bad_response", "ERPNext accepted the sign-in but did not return a session.");
  }
  const cookie = { Cookie: `sid=${sid}` };

  try {
    const user = await erpRequest("/api/method/frappe.auth.get_logged_user", {}, {
      what: "signed-in user",
      headers: cookie,
    });
    const userId = (user.json as { message?: string }).message;
    if (!userId) throw new ErpError("bad_response", "ERPNext did not return the signed-in user.");

    if (!isAllowedUser(userId)) {
      throw new LoginError("This account is not authorised to access the dashboard.");
    }

    const sections: Section[] = [];
    for (const [section, doctype] of Object.entries(SECTION_DOCTYPES) as [Section, string][]) {
      try {
        await erpRequest(
          "/api/method/frappe.client.get_list",
          { doctype, fields: ["name"], limit_page_length: 1 },
          { what: doctype, headers: cookie },
        );
        sections.push(section);
      } catch (err) {
        if (err instanceof ErpError && err.kind === "forbidden") continue;
        throw err;
      }
    }
    return { user: userId, fullName: body.full_name || userId, sections };
  } finally {
    // End the ERPNext session we just created; failures here are not fatal.
    await erpRequest("/api/method/logout", {}, { what: "sign-out", method: "POST", headers: cookie }).catch(
      () => undefined,
    );
  }
}
