import { deskUrl } from "@/lib/erp/links";

/** Document name linking to the record in ERPNext. */
export function DocLink({ doctype, name }: { doctype: string; name: string }) {
  return (
    <a
      href={deskUrl(doctype, name)}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-accent hover:underline"
      title={`Open ${doctype} ${name} in ERPNext`}
    >
      {name}
    </a>
  );
}
