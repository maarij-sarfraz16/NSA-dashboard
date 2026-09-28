import type { CurrencyAmount } from "@/lib/data/shared";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";

/** Note listing balances in currencies other than the company currency (never added together). */
export function OtherCurrencies({ others }: { others: CurrencyAmount[] }) {
  if (others.length === 0) return null;
  return (
    <span>
      Plus{" "}
      {others.map((o, i) => (
        <span key={o.currency} title={formatMoney(o.amount, o.currency)}>
          {i > 0 && ", "}
          {formatMoneyCompact(o.amount, o.currency)} ({formatNumber(o.count)})
        </span>
      ))}{" "}
      in other currencies
    </span>
  );
}
