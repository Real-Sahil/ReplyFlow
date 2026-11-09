import { describe, expect, it } from "vitest";

import { mapRows } from "./engine";
import { billsSpec, claimsSpec, moneySpec } from "./specs";

const NOW = new Date("2026-11-04T12:00:00Z");

describe("mapRows with the claims sheet", () => {
  const spec = claimsSpec(NOW);
  it("reads headings in any order and any capitals, and numbers the rows of the sheet", () => {
    const result = mapRows(
      [
        ["TYPE", "what for", "Amount", "date", "Notes to self"],
        ["Travel and vehicle", "Parking", "£12.50", "04/11/2026", "x"],
        ["", "Stamps", "3", "2026-11-03", ""],
        ["", "", "", "", ""],
        ["Nonsense", "Lunch", "0", "05/11/2027", ""],
      ],
      spec,
    );
    expect(result.problem).toBeNull();
    expect(result.ignoredColumns).toEqual(["Notes to self"]);
    expect(result.rows.map((r) => r.row)).toEqual([2, 3, 5]);
    expect(result.rows[0].value).toEqual({
      claim_date: "2026-11-04",
      amount_pence: 1250,
      category: "travel_out",
      description: "Parking",
    });
    expect(result.rows[1].value?.category).toBe("other_out");
    expect(result.rows[2].errors).toHaveLength(3);
  });
  it("asks for the missing headings by name", () => {
    const result = mapRows(
      [
        ["Date", "Cost"],
        ["04/11/2026", "5"],
      ],
      spec,
    );
    expect(result.problem).toMatch(/What for/);
  });
  it("ignores the template's example row and says so", () => {
    const result = mapRows(
      [
        ["Date", "Amount", "What for", "Type"],
        ["Example", "12.50", "Parking", "Travel and vehicle"],
        ["04/11/2026", "5", "Stamps", ""],
      ],
      spec,
    );
    expect(result.examples).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
  it("refuses an empty file and too many rows", () => {
    expect(mapRows([], spec).problem).toMatch(/empty/);
    const many = [["Date", "Amount", "What for"]];
    for (let i = 0; i < 101; i += 1) many.push(["04/11/2026", "1", "x"]);
    expect(mapRows(many, spec).problem).toMatch(/at most 100/);
  });
  it("refuses the same claim written twice in one sheet", () => {
    const r = mapRows(
      [
        ["Date", "Amount", "What for"],
        ["04/11/2026", "12.50", "Parking"],
        ["04/11/2026", "£12.5", "parking "],
        ["04/11/2026", "12.50", "Parking, second visit"],
      ],
      spec,
    );
    expect(r.rows[1].errors[0]).toMatch(/same as row 2/);
    expect(r.rows[2].errors).toHaveLength(0);
  });
  it("refuses a date a year ago and amounts over 5,000", () => {
    const r = mapRows(
      [
        ["Date", "Amount", "What for"],
        ["01/01/2025", "5000.01", "x"],
      ],
      spec,
    );
    expect(r.rows[0].errors.join(" ")).toMatch(/more than a year/);
    expect(r.rows[0].errors.join(" ")).toMatch(/up to 5,000/);
  });
});

describe("money sheet", () => {
  const categories = [
    { code: "rent", label: "Rent and utilities", direction: "out" as const },
    {
      code: "sales_other",
      label: "Sales taken outside invoices",
      direction: "in" as const,
    },
  ];
  const spec = moneySpec(categories, NOW);
  it("takes the direction from the type", () => {
    const r = mapRows(
      [
        ["Date", "Type", "Amount", "Who", "How paid"],
        ["04/11/2026", "rent and utilities", "850", "Reading Lettings", "bank"],
        ["03/11/2026", "Sales taken outside invoices", "40", "", ""],
      ],
      spec,
    );
    expect(r.rows[0].value).toMatchObject({
      direction: "out",
      category: "rent",
      amount_pence: 85000,
      payment_method: "bank_transfer",
      note: "Reading Lettings",
    });
    expect(r.rows[1].value).toMatchObject({
      direction: "in",
      payment_method: null,
      note: "Sales taken outside invoices",
    });
  });
  it("names an unknown type", () => {
    const r = mapRows(
      [
        ["Date", "Type", "Amount"],
        ["04/11/2026", "Biscuits", "5"],
      ],
      spec,
    );
    expect(r.rows[0].errors[0]).toMatch(/Biscuits/);
  });
});

describe("bills sheet", () => {
  const spec = billsSpec(
    [
      { code: "materials", label: "Stock and materials" },
      { code: "other", label: "Other" },
    ],
    NOW,
  );
  const head = [
    "Bill date",
    "Supplier",
    "What for",
    "Amount before VAT",
    "VAT",
    "VAT reclaimable",
    "Paid on",
    "How paid",
    "Category",
  ];
  it("works out VAT code and keeps unpaid bills unpaid", () => {
    const r = mapRows(
      [
        head,
        [
          "04/11/2026",
          "Screwfix",
          "Paint",
          "100",
          "20",
          "",
          "",
          "",
          "materials",
        ],
        [
          "03/11/2026",
          "Post Office",
          "Stamps",
          "10",
          "",
          "",
          "03/11/2026",
          "card",
          "",
        ],
      ],
      spec,
    );
    expect(r.rows[0].value).toMatchObject({
      vat_code: "S",
      net_pence: 10000,
      vat_pence: 2000,
      vat_reclaimable: true,
      paid_date: null,
      category: "materials",
    });
    expect(r.rows[1].value).toMatchObject({
      vat_code: "O",
      vat_pence: 0,
      paid_date: "2026-11-03",
      payment_method: "card",
      category: "other",
    });
  });
  it("refuses VAT above the amount, and a method with no paid date", () => {
    const r = mapRows(
      [head, ["04/11/2026", "A", "B", "10", "11", "maybe", "", "card", ""]],
      spec,
    );
    const text = r.rows[0].errors.join(" ");
    expect(text).toMatch(/cannot be more/);
    expect(text).toMatch(/Yes or No/);
    expect(text).toMatch(/Paid on/);
  });
});

describe("the same entry twice in one sheet", () => {
  it("is refused for the money book", () => {
    const spec = moneySpec(
      [
        {
          code: "rent",
          label: "Rent and utilities",
          direction: "out" as const,
        },
      ],
      NOW,
    );
    const r = mapRows(
      [
        ["Date", "Type", "Amount", "Who", "Note"],
        [
          "04/11/2026",
          "Rent and utilities",
          "850",
          "Reading Lettings",
          "Nov rent",
        ],
        [
          "04/11/2026",
          "rent and utilities",
          "850.00",
          "reading lettings",
          "nov rent",
        ],
        [
          "04/11/2026",
          "Rent and utilities",
          "850",
          "Reading Lettings",
          "Nov rent, second unit",
        ],
      ],
      spec,
    );
    expect(r.rows[1].errors[0]).toMatch(/same as row 2/);
    expect(r.rows[2].errors).toHaveLength(0);
  });
  it("is refused for bills: same supplier and invoice number, or same details with none", () => {
    const spec = billsSpec([{ code: "other", label: "Other" }], NOW);
    const r = mapRows(
      [
        ["Bill date", "Supplier", "What for", "Amount before VAT", "Reference"],
        ["04/11/2026", "Screwfix", "Paint", "100", "INV-1"],
        ["05/11/2026", "SCREWFIX", "Other things", "55", "inv-1"],
        ["04/11/2026", "Post Office", "Stamps", "10", ""],
        ["04/11/2026", "Post Office", "stamps", "10.00", ""],
        ["04/11/2026", "Post Office", "Parcel", "10", ""],
      ],
      spec,
    );
    expect(r.rows[1].errors[0]).toMatch(/same as row 2/);
    expect(r.rows[3].errors[0]).toMatch(/same as row 4/);
    expect(r.rows[4].errors).toHaveLength(0);
  });
});
