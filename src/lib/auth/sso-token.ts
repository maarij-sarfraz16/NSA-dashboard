/**
 * One-time hand-off token minted by ERPNext (nsa_import.api.open_external_dashboard) for a user who is
 * already signed in to the ERPNext desk: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * It is signed with SSO_SECRET, which is shared only between ERPNext and this server, and lives for ~60s.
 */

import { SECTIONS, type Section } from "./session-token";

export type SsoPayload = {
  user: string;
  fullName: string;
  sections: Section[];
  /** epoch seconds */
  exp: number;
  nonce: string;
};

const enc = new TextEncoder();

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Longest lifetime accepted, whatever exp the token claims. */
const MAX_TTL_SECONDS = 120;

export async function verifySsoToken(token: string | null, secret: string): Promise<SsoPayload | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "verify",
    ]);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Partial<SsoPayload> & { iat?: number };
    const now = Date.now() / 1000;
    if (typeof data.exp !== "number" || data.exp < now) return null;
    if (typeof data.iat === "number" && data.exp - data.iat > MAX_TTL_SECONDS) return null;
    if (typeof data.user !== "string" || !data.user || typeof data.nonce !== "string" || !data.nonce) return null;
    return {
      user: data.user,
      fullName: typeof data.fullName === "string" && data.fullName ? data.fullName : data.user,
      sections: Array.isArray(data.sections) ? data.sections.filter((s): s is Section => SECTIONS.includes(s)) : [],
      exp: data.exp,
      nonce: data.nonce,
    };
  } catch {
    return null;
  }
}

/** Single-use guard: a token that was already redeemed on this server is refused (best effort, in memory). */
const used = new Map<string, number>();

export function redeemOnce(nonce: string, exp: number): boolean {
  const now = Date.now() / 1000;
  for (const [n, e] of used) if (e < now) used.delete(n);
  if (used.has(nonce)) return false;
  used.set(nonce, exp);
  return true;
}
