// CSV for the spreadsheet export. Kept free of Deno-only APIs so it can be unit tested.

// Spreadsheets run a cell that starts with = + - @ as a formula. Prefixing it with an
// apostrophe keeps the text as text, so a customer name cannot run anything.
const guard = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = guard(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (
  rows: Record<string, unknown>[],
  columns: string[],
): string => {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
};

// Compares two secrets without stopping at the first different character.
export const sameSecret = (given: string, expected: string): boolean => {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
};
