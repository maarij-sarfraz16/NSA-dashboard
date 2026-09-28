import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { SESSION_COOKIE, signSession, verifySession, type Section, type Session } from "./session-token";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, getConfig().sessionSecret);
}

/** For pages and layouts: redirects to sign-in when there is no valid session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function canView(session: Session, section: Section) {
  return session.sections.includes(section);
}

export async function startSession(data: Omit<Session, "exp">) {
  const config = getConfig();
  const maxAge = config.sessionHours * 3600;
  const token = await signSession(
    { ...data, exp: Math.floor(Date.now() / 1000) + maxAge },
    config.sessionSecret,
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    maxAge,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
