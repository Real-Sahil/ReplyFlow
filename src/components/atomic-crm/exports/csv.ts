// CSV for exports made in the browser. Spreadsheets run a cell that starts with = + - @
// as a formula, so such cells are prefixed with an apostrophe and stay text.

const guard = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = guard(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Keys are the columns in order; labels are the header row.
export const toCsv = (
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
): string => {
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c.key])).join(","));
  }
  // A byte-order mark makes Excel read UTF-8 (pounds signs, accents) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
};

export const downloadCsv = (filename: string, csv: string) => {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
