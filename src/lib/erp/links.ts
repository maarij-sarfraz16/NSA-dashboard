import "server-only";

import { getConfig } from "@/lib/env";

/** URL of a record in the ERPNext desk (the source of truth), e.g. /app/sales-order/SO-0001. */
export function deskUrl(doctype: string, name: string): string {
  const slug = doctype.toLowerCase().replace(/ /g, "-");
  return `${getConfig().erpBaseUrl}/app/${slug}/${encodeURIComponent(name)}`;
}
