// VAT arithmetic, in pence, for UK rules. Pure functions, so every rule can be tested.
//
// A business that is not VAT registered charges no VAT: pass `vatRegistered: false` and every
// line comes back with a VAT of zero and the price unchanged.
//
// Rounding: VAT is worked out once for each rate on the total of its lines, then rounded to
// the nearest penny (half up). HMRC accepts this as long as it is applied the same way on
// every invoice.

export type VatCode = "S" | "R" | "Z" | "E" | "O";

export const VAT_RATES: Record<VatCode, { label: string; percent: number }> = {
  S: { label: "Standard rate", percent: 20 },
  R: { label: "Reduced rate", percent: 5 },
  Z: { label: "Zero rated", percent: 0 },
  E: { label: "Exempt", percent: 0 },
  O: { label: "Outside the scope of VAT", percent: 0 },
};

export type VatLine = {
  // What was typed in, in pence: the price with VAT if pricesIncludeVat, otherwise without.
  amountPence: number;
  vatCode: VatCode;
};

export type VatSettings = {
  vatRegistered: boolean;
  pricesIncludeVat: boolean;
};

export type VatBand = {
  vatCode: VatCode;
  percent: number;
  netPence: number;
  vatPence: number;
  grossPence: number;
};

export type VatTotals = {
  netPence: number;
  vatPence: number;
  grossPence: number;
  bands: VatBand[];
};

// Half up, and safe for the .5 cases that floating point gets wrong.
const roundHalfUp = (value: number) => Math.floor(value + 0.5 + 1e-9);

export const vatOnNet = (netPence: number, percent: number) =>
  roundHalfUp((netPence * percent) / 100);

// Splits a price that includes VAT into its net and VAT parts.
export const splitGross = (grossPence: number, percent: number) => {
  const netPence = roundHalfUp((grossPence * 100) / (100 + percent));
  return { netPence, vatPence: grossPence - netPence };
};

export const invoiceTotals = (
  lines: VatLine[],
  settings: VatSettings,
): VatTotals => {
  const byCode = new Map<VatCode, number>();
  for (const line of lines) {
    byCode.set(
      line.vatCode,
      (byCode.get(line.vatCode) ?? 0) + line.amountPence,
    );
  }

  const bands: VatBand[] = [];
  for (const [vatCode, amount] of byCode) {
    const percent = settings.vatRegistered ? VAT_RATES[vatCode].percent : 0;
    let netPence: number;
    let vatPence: number;
    if (!settings.vatRegistered || percent === 0) {
      netPence = amount;
      vatPence = 0;
    } else if (settings.pricesIncludeVat) {
      ({ netPence, vatPence } = splitGross(amount, percent));
    } else {
      netPence = amount;
      vatPence = vatOnNet(amount, percent);
    }
    bands.push({
      vatCode,
      percent,
      netPence,
      vatPence,
      grossPence: netPence + vatPence,
    });
  }

  return {
    netPence: bands.reduce((sum, b) => sum + b.netPence, 0),
    vatPence: bands.reduce((sum, b) => sum + b.vatPence, 0),
    grossPence: bands.reduce((sum, b) => sum + b.grossPence, 0),
    bands,
  };
};

// Flat rate scheme: the VAT owed to HMRC is the flat percentage of the VAT-inclusive turnover.
// It is what the business pays, not what it charges its customers.
export const flatRateVatOwed = (grossTurnoverPence: number, percent: number) =>
  roundHalfUp((grossTurnoverPence * percent) / 100);

// A UK VAT number as it is stored: GB and nine digits (or twelve for a branch), or the
// government department and health authority forms.
export const isValidUkVatNumber = (value: string) =>
  /^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$/.test(value);

// Tidies what was typed: capitals, no spaces, and the GB prefix if only digits were given.
export const normaliseVatNumber = (value: string) => {
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9]{9}([0-9]{3})?$/.test(compact) ? `GB${compact}` : compact;
};
