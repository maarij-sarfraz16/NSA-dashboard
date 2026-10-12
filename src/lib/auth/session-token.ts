/**
 * Signed, stateless session token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Uses Web Crypto only, so it runs in both the proxy and server components.
 * It contains no ERPNext credentials - only who signed in and which sections they may see.
 */

export const SESSION_COOKIE = "nsa_dash_session";
/** The company the viewer last picked; used when the URL carries no ?company=. */
export const COMPANY_COOKIE = "company";

export const SECTIONS = ["sales", "purchase", "manufacturing", "attendance", "payroll", "assets"] as const;
export type Section = (typeof SECTIONS)[number];

/** The only ERPNext users allowed to sign in (compared case-insensitively). */
export const ALLOWED_USERS = ["administrator", "saadsohail@nsagroup.com.pk"];

export function isAllowedUser(user: string): boolean {
  return ALLOWED_USERS.includes(user.trim().toLowerCase());
}

export type Session = {
  /** ERPNext user id (email) */
  user: string;
  fullName: string;
  sections: Section[];
  /** epoch seconds */
  exp: number;
};

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(session)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromB64url(sig) as BufferSource,
      enc.encode(payload),
    );
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    if (typeof session.exp !== "number" || session.exp * 1000 < Date.now()) return null;
    if (!Array.isArray(session.sections) || typeof session.user !== "string") return null;
    if (!isAllowedUser(session.user)) return null;
    session.sections = session.sections.filter((s): s is Section => SECTIONS.includes(s));
    return session;
  } catch {
    return null;
  }
}
