// Markets and currencies. An administrator chooses a business's market and currency in Settings; both are
// saved in that business's configuration, so every sign-in of the business sees amounts the same way.
//
// Amounts are stored in the smallest unit (pence, cents) and divided by 100, so only currencies with two
// decimal places are offered. Tax: invoices, bills and the VAT return are built for UK VAT. In any other market
// the business is not treated as VAT registered, so invoices are issued without tax lines and prices are
// entered as they are charged.

export type Market = {
  code: string;
  name: string;
  currency: string; // the usual currency, offered first when the market is chosen
  locale: string; // how numbers are written
  ukTax: boolean; // UK VAT rules, the VAT return and flat-rate scheme apply
};

export const DEFAULT_MARKET = "GB";

export const MARKETS: Market[] = [
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    ukTax: true,
  },
  {
    code: "IE",
    name: "Ireland",
    currency: "EUR",
    locale: "en-IE",
    ukTax: false,
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    ukTax: false,
  },
  {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    locale: "en-CA",
    ukTax: false,
  },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    locale: "en-AU",
    ukTax: false,
  },
  {
    code: "NZ",
    name: "New Zealand",
    currency: "NZD",
    locale: "en-NZ",
    ukTax: false,
  },
  {
    code: "DE",
    name: "Germany",
    currency: "EUR",
    locale: "de-DE",
    ukTax: false,
  },
  {
    code: "FR",
    name: "France",
    currency: "EUR",
    locale: "fr-FR",
    ukTax: false,
  },
  {
    code: "NL",
    name: "Netherlands",
    currency: "EUR",
    locale: "nl-NL",
    ukTax: false,
  },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES", ukTax: false },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT", ukTax: false },
  {
    code: "AE",
    name: "United Arab Emirates",
    currency: "AED",
    locale: "en-AE",
    ukTax: false,
  },
  {
    code: "ZA",
    name: "South Africa",
    currency: "ZAR",
    locale: "en-ZA",
    ukTax: false,
  },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", ukTax: false },
  {
    code: "SG",
    name: "Singapore",
    currency: "SGD",
    locale: "en-SG",
    ukTax: false,
  },
];

// Currencies with two decimal places, which is what amounts in pence and cents need.
export const CURRENCIES = [
  "GBP",
  "EUR",
  "USD",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "ZAR",
  "INR",
  "AED",
  "SGD",
  "HKD",
  "MXN",
] as const;

export const marketFor = (code: string | null | undefined): Market =>
  MARKETS.find((m) => m.code === code) ?? MARKETS[0];

export const isSupportedCurrency = (code: string | null | undefined) =>
  !!code && (CURRENCIES as readonly string[]).includes(code);

export const currencyName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const currencyChoices = () =>
  CURRENCIES.map((code) => ({
    id: code,
    name: `${code} – ${currencyName(code)}`,
  }));

export const marketChoices = () =>
  MARKETS.map((m) => ({ id: m.code, name: m.name }));
