// Reads a spreadsheet of post drafts (CSV) and checks each row before anything is saved.
// Columns: reference, caption, alt_text (optional). Each row becomes one draft, which then
// goes through the usual review. Nothing here publishes or schedules a post.

export const MAX_CAPTION = 2000;
export const MAX_ALT = 200;

// A small CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes.
export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
};

export type DraftRow = {
  line: number;
  reference: string;
  caption: string;
  alt_text: string | null;
};
export type DraftProblem = { line: number; message: string };

export const checkDrafts = (
  rows: string[][],
  knownReferences: Set<string>,
): { drafts: DraftRow[]; problems: DraftProblem[] } => {
  const drafts: DraftRow[] = [];
  const problems: DraftProblem[] = [];
  if (rows.length === 0)
    return { drafts, problems: [{ line: 0, message: "The file is empty." }] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const refCol = col("reference");
  const capCol = col("caption");
  const altCol = col("alt_text");
  if (refCol < 0 || capCol < 0) {
    return {
      drafts,
      problems: [
        {
          line: 1,
          message: "The first row needs the columns reference and caption.",
        },
      ],
    };
  }

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const reference = (cells[refCol] ?? "").trim();
    const caption = (cells[capCol] ?? "").trim();
    const alt = altCol >= 0 ? (cells[altCol] ?? "").trim() : "";
    if (!reference)
      return problems.push({ line, message: "No product reference." });
    if (!knownReferences.has(reference.toLowerCase()))
      return problems.push({
        line,
        message: `No listing with reference ${reference}.`,
      });
    if (!caption)
      return problems.push({ line, message: "The caption is empty." });
    if (caption.length > MAX_CAPTION)
      return problems.push({
        line,
        message: `The caption is longer than ${MAX_CAPTION} characters.`,
      });
    if (alt.length > MAX_ALT)
      return problems.push({
        line,
        message: `Alt text is longer than ${MAX_ALT} characters.`,
      });
    drafts.push({ line, reference, caption, alt_text: alt || null });
  });
  return { drafts, problems };
};
