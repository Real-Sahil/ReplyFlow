import { describe, expect, it } from "vitest";
import { checkDrafts, parseCsv } from "./draftImport";

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes and line breaks inside a field", () => {
    const rows = parseCsv(
      '﻿reference,caption\r\nHAR-1,"Soft, deep seat\nand ""linen"""\r\n',
    );
    expect(rows).toEqual([
      ["reference", "caption"],
      ["HAR-1", 'Soft, deep seat\nand "linen"'],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("checkDrafts", () => {
  const known = new Set(["har-1", "lea-2"]);

  it("accepts rows with a known reference and a caption", () => {
    const { drafts, problems } = checkDrafts(
      [
        ["reference", "caption", "alt_text"],
        ["HAR-1", "Soft linen", "Grey three seater"],
      ],
      known,
    );
    expect(problems).toEqual([]);
    expect(drafts).toEqual([
      {
        line: 2,
        reference: "HAR-1",
        caption: "Soft linen",
        alt_text: "Grey three seater",
      },
    ]);
  });

  it("reports each row that cannot be used, with its line number", () => {
    const { drafts, problems } = checkDrafts(
      [
        ["reference", "caption"],
        ["NOPE", "x"],
        ["LEA-2", ""],
        ["", "y"],
        ["LEA-2", "fine"],
      ],
      known,
    );
    expect(drafts.map((d) => d.line)).toEqual([5]);
    expect(problems.map((p) => p.line)).toEqual([2, 3, 4]);
  });

  it("needs the reference and caption columns", () => {
    expect(checkDrafts([["sku", "text"]], known).problems[0].message).toMatch(
      /reference and caption/,
    );
  });
});
