type Tone = "good" | "warn" | "bad" | "neutral" | "info";

const TONES: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-neutral-soft text-neutral",
  info: "bg-accent-soft text-accent",
};

/** ERPNext status -> tone. Anything unknown renders neutral. */
const STATUS_TONES: Record<string, Tone> = {
  // selling / buying
  "To Deliver and Bill": "info",
  "To Deliver": "info",
  "To Bill": "info",
  "To Receive and Bill": "info",
  "To Receive": "info",
  Completed: "good",
  Delivered: "good",
  Paid: "good",
  Unpaid: "warn",
  "Partly Paid": "warn",
  Overdue: "bad",
  "On Hold": "warn",
  Draft: "neutral",
  Closed: "neutral",
  Cancelled: "neutral",
  Return: "neutral",
  "Credit Note Issued": "neutral",
  "Debit Note Issued": "neutral",
  // manufacturing
  "Not Started": "neutral",
  "In Process": "info",
  Stopped: "bad",
  // hr
  Present: "good",
  "Work From Home": "info",
  "Half Day": "warn",
  "On Leave": "neutral",
  Absent: "bad",
  "Not Marked": "warn",
  Submitted: "good",
  Withheld: "warn",
  // letters of credit
  Opened: "info",
  Amended: "info",
  "Partially Shipped": "info",
  Expired: "bad",
};

export function StatusBadge({ status, tone }: { status: string | null | undefined; tone?: Tone }) {
  if (!status) return <span className="text-ink-3">—</span>;
  const t = tone ?? STATUS_TONES[status] ?? "neutral";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11.5px] font-medium ${TONES[t]}`}
    >
      {status}
    </span>
  );
}

export function Flag({ children, tone = "bad" }: { children: string; tone?: "bad" | "warn" }) {
  return (
    <span className={`ml-1.5 text-[11.5px] font-medium ${tone === "bad" ? "text-bad" : "text-warn"}`}>
      {children}
    </span>
  );
}
