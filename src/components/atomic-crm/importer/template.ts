import Papa from "papaparse";

import type { Spec } from "./engine";

const headings = <T>(spec: Spec<T>) => spec.columns.map((c) => c.label);

// The sample row. Its first cell is "Example", which the reader ignores, so a forgotten example never
// becomes a real entry.
const example = <T>(spec: Spec<T>) =>
  spec.columns.map((c, i) => (i === 0 ? "Example" : c.example));

export const templateCsv = <T>(spec: Spec<T>) =>
  `﻿${Papa.unparse([headings(spec), example(spec)])}\r\n`;

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const downloadCsvTemplate = <T>(spec: Spec<T>) =>
  save(
    new Blob([templateCsv(spec)], { type: "text/csv;charset=utf-8" }),
    `${spec.filename}.csv`,
  );

export const downloadXlsxTemplate = async <T>(spec: Spec<T>) => {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = headings(spec).map((value) => ({
    value,
    fontWeight: "bold" as const,
  }));
  const blob = await writeExcelFile([head, example(spec)]).toBlob();
  save(blob, `${spec.filename}.xlsx`);
};
