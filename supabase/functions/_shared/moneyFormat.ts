// How money is written in a business's messages. The business's market and currency are chosen by an
// administrator in Settings and kept in configuration.config. Amounts are in the smallest unit (pence, cents).

export type MoneyFormat = { currency: string; locale: string };

export const DEFAULT_MONEY_FORMAT: MoneyFormat = {
  currency: "GBP",
  locale: "en-GB",
};

const LOCALES: Record<string, string> = {
  GB: "en-GB",
  IE: "en-IE",
  US: "en-US",
  CA: "en-CA",
  AU: "en-AU",
  NZ: "en-NZ",
  DE: "de-DE",
  FR: "fr-FR",
  NL: "nl-NL",
  ES: "es-ES",
  IT: "it-IT",
  AE: "en-AE",
  ZA: "en-ZA",
  IN: "en-IN",
  SG: "en-SG",
};

export const moneyFormatFor = (
  currency: unknown,
  market: unknown,
): MoneyFormat => ({
  currency:
    typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
      ? currency
      : DEFAULT_MONEY_FORMAT.currency,
  locale: LOCALES[String(market)] ?? DEFAULT_MONEY_FORMAT.locale,
});

export const formatMoney = (
  pence: number,
  format: MoneyFormat = DEFAULT_MONEY_FORMAT,
  options: { whole?: boolean } = {},
) =>
  new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.currency,
    ...(options.whole
      ? { minimumFractionDigits: pence % 100 === 0 ? 0 : 2 }
      : {}),
  }).format(pence / 100);
