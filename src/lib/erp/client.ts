import "server-only";

import { getConfig } from "@/lib/env";
import { ErpError } from "./errors";

type Params = Record<string, string | number | boolean | object | undefined | null>;

/** Frappe error bodies carry the reason in a few different places. */
type FrappeErrorBody = {
  exc_type?: string;
  exception?: string;
  message?: unknown;
  _server_messages?: string;
  _error_message?: string;
};

function encodeParams(params: Params): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return qs.toString();
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractMessage(body: FrappeErrorBody | undefined): string | undefined {
  if (!body) return undefined;
  if (body._error_message) return stripHtml(body._error_message);
  if (body._server_messages) {
    try {
      const messages = (JSON.parse(body._server_messages) as string[]).map((m) => {
        try {
          const parsed = JSON.parse(m) as { message?: string };
          return parsed.message ?? m;
        } catch {
          return m;
        }
      });
      const text = stripHtml(messages.join(" "));
      if (text) return text;
    } catch {
      /* fall through */
    }
  }
  // e.g. {"message": "Invalid login credentials", "exc_type": "AuthenticationError"}
  if (typeof body.message === "string" && body.message.trim()) return stripHtml(body.message);
  if (body.exception) {
    // "frappe.exceptions.PermissionError: Insufficient Permission for Salary Slip"
    const match = /^[\w.]+:\s*(.+)$/.exec(body.exception.split("\n")[0]);
    if (match) return stripHtml(match[1]);
  }
  return undefined;
}

function classify(status: number, body: FrappeErrorBody | undefined, what: string): ErpError {
  const reason = extractMessage(body);
  const excType = body?.exc_type ?? "";

  if (status === 401 || excType === "AuthenticationError") {
    return new ErpError(
      "unauthorized",
      "The API key/secret configured for the dashboard was rejected. Check ERP_API_KEY and ERP_API_SECRET.",
      status,
      reason,
    );
  }
  if (status === 403 || excType === "PermissionError") {
    return new ErpError(
      "forbidden",
      `The dashboard's ERPNext service user is not permitted to read ${what}.${reason ? ` (${reason})` : ""}`,
      status,
      reason,
    );
  }
  if (status === 404 || excType === "DoesNotExistError") {
    return new ErpError("not_found", `${what} was not found in ERPNext.`, status, reason);
  }
  if (status === 429) {
    return new ErpError(
      "rate_limited",
      "Too many requests were sent to ERPNext. Wait a moment and refresh.",
      status,
      reason,
    );
  }
  if (status === 417 || status === 400 || excType.endsWith("ValidationError")) {
    return new ErpError(
      "validation",
      `ERPNext could not process the query for ${what}.${reason ? ` ${reason}` : ""}`,
      status,
      reason,
    );
  }
  return new ErpError(
    "server",
    `ERPNext returned HTTP ${status} while loading ${what}.${reason ? ` ${reason}` : ""}`,
    status,
    reason,
  );
}

type RequestOptions = {
  /** Human description of what is being loaded, used in error messages. */
  what: string;
  /** Extra headers (e.g. a user's session cookie). When set, the service key is not sent. */
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: Params;
};

export type RawResponse = { status: number; headers: Headers; json: unknown };

/**
 * Low-level request to ERPNext. Always bypasses the Next.js data cache so every
 * render reflects the current state of the source system.
 */
export async function erpRequest(path: string, params: Params, opts: RequestOptions): Promise<RawResponse> {
  const config = getConfig();
  const method = opts.method ?? "GET";
  const query = method === "GET" ? encodeParams(params) : "";
  const url = `${config.erpBaseUrl}${path}${query ? `?${query}` : ""}`;

  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (!opts.headers) {
    headers.Authorization = `token ${config.erpApiKey}:${config.erpApiSecret}`;
  }
  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeParams(opts.body ?? params);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ErpError(
        "timeout",
        `ERPNext did not respond within ${Math.round(config.requestTimeoutMs / 1000)}s while loading ${opts.what}.`,
      );
    }
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : String(err);
    throw new ErpError("network", `Could not connect to ERPNext at ${config.erpBaseUrl} (${cause}).`);
  }

  let json: unknown;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    throw classify(res.status, json as FrappeErrorBody | undefined, opts.what);
  }
  if (json === undefined) {
    throw new ErpError(
      "bad_response",
      `ERPNext returned a non-JSON response (HTTP ${res.status}) while loading ${opts.what}.`,
      res.status,
    );
  }
  return { status: res.status, headers: res.headers, json };
}

/** Calls a whitelisted method (`/api/method/<name>`) with the service key and returns `message`. */
export async function callMethod<T>(method: string, params: Params, what: string): Promise<T> {
  const { json } = await erpRequest(`/api/method/${method}`, params, { what });
  if (!json || typeof json !== "object" || !("message" in json)) {
    throw new ErpError("bad_response", `ERPNext response for ${what} had no "message" field.`);
  }
  return (json as { message: T }).message;
}
