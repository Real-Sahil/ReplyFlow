import { moneyFormat } from "../markets/moneyFormat";

// A price in the business's currency, without the pence when it is a whole amount. A currency can be passed
// for a record that carries its own.
export const formatPrice = (
  pence: number | null | undefined,
  currency?: string,
) =>
  pence == null
    ? ""
    : new Intl.NumberFormat(moneyFormat().locale, {
        style: "currency",
        currency: currency ?? moneyFormat().currency,
        minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
      }).format(pence / 100);
