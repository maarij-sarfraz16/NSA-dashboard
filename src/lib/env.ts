import "server-only";

/**
 * Server-side configuration. Every value here is read from environment variables
 * (see .env.example) and must never be imported into client components.
 */

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

export type ServerConfig = {
  erpBaseUrl: string;
  erpApiKey: string;
  erpApiSecret: string;
  sessionSecret: string;
  sessionHours: number;
  requestTimeoutMs: number;
  defaultCompany: string | undefined;
  secureCookies: boolean;
};

let cached: ServerConfig | undefined;

export function getConfig(): ServerConfig {
  if (cached) return cached;

  const erpBaseUrl = required("ERP_BASE_URL").replace(/\/+$/, "");
  try {
    new URL(erpBaseUrl);
  } catch {
    throw new ConfigError(`ERP_BASE_URL is not a valid URL: ${erpBaseUrl}`);
  }

  const sessionSecret = required("SESSION_SECRET");
  if (sessionSecret.length < 32) {
    throw new ConfigError("SESSION_SECRET must be at least 32 characters long.");
  }

  cached = {
    erpBaseUrl,
    erpApiKey: required("ERP_API_KEY"),
    erpApiSecret: required("ERP_API_SECRET"),
    sessionSecret,
    sessionHours: Number(process.env.SESSION_HOURS) > 0 ? Number(process.env.SESSION_HOURS) : 8,
    requestTimeoutMs:
      Number(process.env.ERP_TIMEOUT_MS) > 0 ? Number(process.env.ERP_TIMEOUT_MS) : 15000,
    defaultCompany: process.env.ERP_DEFAULT_COMPANY?.trim() || undefined,
    // Cookies are marked Secure in production unless explicitly disabled
    // (needed only when the dashboard is served over plain HTTP on a LAN).
    secureCookies:
      process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
  };
  return cached;
}
