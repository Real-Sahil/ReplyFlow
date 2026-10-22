import { describe, expect, it } from "vitest";
import { sameSecret, toCsv } from "./csv.ts";

describe("toCsv", () => {
  it("writes the header and one line per row", () => {
    const csv = toCsv(
      [
        { id: 1, name: "Sofa order", amount: 1200 },
        { id: 2, name: "Footstool", amount: null },
      ],
      ["id", "name", "amount"],
    );
    expect(csv).toBe("id,name,amount\r\n1,Sofa order,1200\r\n2,Footstool,\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    const csv = toCsv([{ name: 'Smith, "Bob"\nline two' }], ["name"]);
    expect(csv).toBe('name\r\n"Smith, ""Bob""\nline two"\r\n');
  });

  it("stops spreadsheet formulas from running", () => {
    const csv = toCsv(
      [
        { name: '=HYPERLINK("http://x")' },
        { name: "+44 7700" },
        { name: "-5" },
        { name: "@sum" },
      ],
      ["name"],
    );
    expect(csv.split("\r\n").slice(1, 5)).toEqual([
      // The formula has quotes, so the cell is wrapped and its quotes doubled.
      '"\'=HYPERLINK(""http://x"")"',
      "'+44 7700",
      "'-5",
      "'@sum",
    ]);
  });
});

describe("sameSecret", () => {
  it("accepts only an exact match", () => {
    expect(sameSecret("abc123", "abc123")).toBe(true);
    expect(sameSecret("abc124", "abc123")).toBe(false);
    expect(sameSecret("abc", "abc123")).toBe(false);
  });

  it("refuses when no secret is configured", () => {
    expect(sameSecret("", "")).toBe(false);
    expect(sameSecret("anything", "")).toBe(false);
  });
});
