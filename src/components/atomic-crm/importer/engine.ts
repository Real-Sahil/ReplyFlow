// Reading a spreadsheet the way a person fills one in. Pure functions, so the rules can be tested.
// Columns are found by their headings (any order, any capitals, a few alternative names), every row is
// checked, and a row that is wrong is reported by its row number in the sheet. Nothing is written
// until the whole sheet is right.

import { parseBankDate } from "../finance/bankMatch";

export type Column = {
  key: string;
  label: string;
  aliases?: string[];
  required?: boolean;
  example: string;
  help: string;
};

export type Validated<T> = { value?: T; errors: string[] };

export type Spec<T> = {
  id: string;
  title: string;
  filename: string;
  maxRows: number;
  columns: Column[];
  // Plain-English rules shown beside the template.
  notes: string[];
  validate: (cells: Record<string, string>) => Validated<T>;
  // Rows with the same fingerprint are the same entry sent twice in one sheet.
  fingerprint?: (value: T) => string;
  // The few cells shown in the preview for a row that is ready.
  preview: (value: T) => string[];
  previewHeadings: string[];
};

export type RowOutcome<T> = { row: number; value?: T; errors: string[] };

export type MapResult<T> = {
  rows: RowOutcome<T>[];
  problem: string | null;
  ignoredColumns: string[];
  examples: number;
};

export const norm = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, "");

// Rows whose first cell is exactly "Example" are the sample rows of the template.
const isExampleRow = (cells: string[]) =>
  (cells.find((c) => c.trim() !== "") ?? "").trim().toLowerCase() === "example";

export const mapRows = <T>(table: string[][], spec: Spec<T>): MapResult<T> => {
  const empty = (problem: string): MapResult<T> => ({
    rows: [],
    problem,
    ignoredColumns: [],
    examples: 0,
  });

  const firstRow = table.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (firstRow < 0) return empty("The file is empty.");

  const headings = table[firstRow].map((h) => norm(h));
  const index: Record<string, number> = {};
  for (const col of spec.columns) {
    const names = [col.label, col.key, ...(col.aliases ?? [])].map(norm);
    const at = headings.findIndex((h) => h !== "" && names.includes(h));
    if (at >= 0) index[col.key] = at;
  }
  const missing = spec.columns.filter(
    (c) => c.required && index[c.key] === undefined,
  );
  if (missing.length > 0) {
    return empty(
      `The first row needs these headings: ${missing.map((c) => c.label).join(", ")}. Use the template, or rename your columns to match.`,
    );
  }
  const used = new Set(Object.values(index));
  const ignoredColumns = table[firstRow]
    .filter((h, i) => h.trim() !== "" && !used.has(i))
    .map((h) => h.trim());

  const body = table.slice(firstRow + 1);
  const nonBlank = body.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonBlank.length > spec.maxRows) {
    return empty(
      `That is ${nonBlank.length} rows. Please send at most ${spec.maxRows} at a time.`,
    );
  }

  const rows: RowOutcome<T>[] = [];
  let examples = 0;
  body.forEach((raw, i) => {
    if (!raw.some((c) => c.trim() !== "")) return;
    if (isExampleRow(raw)) {
      examples += 1;
      return;
    }
    const cells: Record<string, string> = {};
    for (const col of spec.columns) {
      const at = index[col.key];
      cells[col.key] = at === undefined ? "" : (raw[at] ?? "").trim();
    }
    const result = spec.validate(cells);
    rows.push({
      row: firstRow + i + 2,
      value: result.errors.length === 0 ? result.value : undefined,
      errors: result.errors,
    });
  });

  if (spec.fingerprint) {
    const first = new Map<string, number>();
    for (const outcome of rows) {
      if (outcome.value === undefined) continue;
      const key = spec.fingerprint(outcome.value);
      const earlier = first.get(key);
      if (earlier === undefined) {
        first.set(key, outcome.row);
      } else {
        outcome.errors.push(
          `This is the same as row ${earlier}. If both are real, change the wording of one.`,
        );
        outcome.value = undefined;
      }
    }
  }

  if (rows.length === 0)
    return { ...empty("There are no rows to import."), examples };
  return { rows, problem: null, ignoredColumns, examples };
};

// ---- Reading one cell -------------------------------------------------------------------------

export const parseDate = (text: string): string | null => parseBankDate(text);

// "12.50", "£12.5", "1,250" -> pence. Nothing else: no negatives, no more than two decimals.
export const parsePence = (
  text: string,
  { max, allowZero = false }: { max: number; allowZero?: boolean },
): number | null => {
  const cleaned = text.replace(/[£$€,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number.parseFloat(cleaned) * 100);
  if (pence > max) return null;
  return pence > 0 || (allowZero && pence === 0) ? pence : null;
};

export type Choice = { code: string; label: string; aliases?: string[] };

// Matches what a person typed to one of the allowed choices by its name or code. Capitals, spaces
// and punctuation do not matter.
export const parseChoice = (text: string, choices: Choice[]): Choice | null => {
  const wanted = norm(text);
  if (!wanted) return null;
  return (
    choices.find((c) =>
      [c.code, c.label, ...(c.aliases ?? [])].some((n) => norm(n) === wanted),
    ) ?? null
  );
};

export const parseYesNo = (text: string): boolean | null => {
  const t = norm(text);
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return null;
};

export const todayIso = (now = new Date()) => now.toLocaleDateString("en-CA");

// A date more than a day ahead is almost always a typo (the extra day covers time zones).
export const isFuture = (iso: string, now = new Date()) => {
  const limit = new Date(now.getTime() + 36 * 3600 * 1000);
  return iso > limit.toLocaleDateString("en-CA");
};

export const daysBefore = (iso: string, now = new Date()) =>
  Math.floor(
    (new Date(`${todayIso(now)}T00:00:00Z`).getTime() -
      new Date(`${iso}T00:00:00Z`).getTime()) /
      86400000,
  );
