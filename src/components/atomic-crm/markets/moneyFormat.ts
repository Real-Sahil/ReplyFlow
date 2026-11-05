import { DEFAULT_MARKET, isSupportedCurrency, marketFor } from "./markets";

// How money is written for the business that is signed in. It is set once from the business's configuration
// (see useConfigurationContext) and read by every formatter, so the 30-odd places that write an amount do not
// each need to know the currency.
let current = { currency: "GBP", locale: "en-GB" };

export const setMoneyFormat = (
  currency: string | null | undefined,
  market: string | null | undefined,
) => {
  current = {
    currency: isSupportedCurrency(currency) ? (currency as string) : "GBP",
    locale: marketFor(market ?? DEFAULT_MARKET).locale,
  };
};

export const moneyFormat = () => current;

export const formatMoney = (
  pence: number,
  options: { whole?: boolean; code?: boolean } = {},
) =>
  new Intl.NumberFormat(current.locale, {
    style: "currency",
    currency: current.currency,
    currencyDisplay: options.code ? "code" : "symbol",
    ...(options.whole
      ? { minimumFractionDigits: pence % 100 === 0 ? 0 : 2 }
      : {}),
  }).format(pence / 100);

// The symbol on its own, for labels like "Price (£)".
export const currencySymbol = () =>
  new Intl.NumberFormat(current.locale, {
    style: "currency",
    currency: current.currency,
  })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? current.currency;

// A PDF made with the built-in fonts can only draw Latin-1 letters and the euro sign. A currency whose
// symbol is outside that (zł, ₹, Kč) is written as its code instead, so it never prints as a blank box.
// Spaces that a locale puts between the number and the symbol are plain spaces, which the font can draw.
const SPACES = new RegExp("[\\u202f\\u00a0]", "g");
export const formatMoneyPdf = (pence: number) => {
  const symbolic = formatMoney(pence);
  const drawable = Array.from(symbolic).every((c) => {
    const n = c.codePointAt(0) ?? 0;
    return n <= 0xff || n === 0x20ac || n === 0x202f;
  });
  return (drawable ? symbolic : formatMoney(pence, { code: true })).replace(
    SPACES,
    " ",
  );
};

// A label written with "(£)" shows the business's own symbol, so a list of columns can be written once.
export const withCurrency = (label: string) =>
  label.replace("(£)", `(${currencySymbol()})`);
