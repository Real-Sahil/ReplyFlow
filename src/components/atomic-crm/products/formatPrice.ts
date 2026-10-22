export const formatPrice = (
  pence: number | null | undefined,
  currency = "GBP",
) =>
  pence == null
    ? ""
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
      }).format(pence / 100);
