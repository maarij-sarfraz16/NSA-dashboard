export type ErpErrorKind =
  | "config"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "server"
  | "timeout"
  | "network"
  | "bad_response";

/** A failed call to the ERPNext API, classified so the UI can explain it. */
export class ErpError extends Error {
  constructor(
    public kind: ErpErrorKind,
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "ErpError";
  }
}

/** Serializable form of an error that is safe to pass to client components. */
export type ErrorInfo = { kind: ErpErrorKind; title: string; message: string; status?: number };

const TITLES: Record<ErpErrorKind, string> = {
  config: "Dashboard is not configured",
  unauthorized: "ERPNext rejected the dashboard credentials",
  forbidden: "Not permitted in ERPNext",
  not_found: "Not found in ERPNext",
  rate_limited: "ERPNext is rate limiting requests",
  validation: "ERPNext rejected the request",
  server: "ERPNext returned an error",
  timeout: "ERPNext did not respond in time",
  network: "Cannot reach ERPNext",
  bad_response: "Unexpected response from ERPNext",
};

export function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof ErpError) {
    return { kind: err.kind, title: TITLES[err.kind], message: err.message, status: err.status };
  }
  if (err instanceof Error && err.name === "ConfigError") {
    return { kind: "config", title: TITLES.config, message: err.message };
  }
  return {
    kind: "server",
    title: "Unexpected error",
    message: err instanceof Error ? err.message : "An unknown error occurred.",
  };
}
