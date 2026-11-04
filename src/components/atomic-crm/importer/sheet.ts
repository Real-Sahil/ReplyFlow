import Papa from "papaparse";

const MAX_BYTES = 5 * 1024 * 1024;

// One cell as the text a person would have typed. A date cell becomes YYYY-MM-DD (the half day added
// keeps a date written at local midnight on the right day in any time zone), a number loses the
// floating point dust Excel leaves (12.350000000000001), and an empty cell is "".
export const cellText = (cell: unknown): string => {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    return new Date(cell.getTime() + 12 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
  }
  if (typeof cell === "number") return String(Math.round(cell * 10000) / 10000);
  if (typeof cell === "boolean") return cell ? "yes" : "no";
  return String(cell);
};

// Reads the first sheet of a .csv or .xlsx file into rows of text. Throws a sentence a person can act on.
export const readSheetFile = async (file: File): Promise<string[][]> => {
  if (file.size > MAX_BYTES)
    throw new Error("That file is too big. Please send 5 MB or less.");
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    let data: unknown[][];
    try {
      data = (await readSheet(file)) as unknown[][];
    } catch {
      throw new Error(
        "That Excel file could not be read. Try saving it again as .xlsx or .csv.",
      );
    }
    return data.map((row) => row.map(cellText));
  }

  if (name.endsWith(".xls")) {
    throw new Error(
      "Old .xls files are not supported. In Excel, choose Save As and pick .xlsx or .csv.",
    );
  }
  if (!name.endsWith(".csv") && !name.endsWith(".txt")) {
    throw new Error("Please choose a .csv or .xlsx file.");
  }

  const raw = await file.text();
  // Excel saves CSV with a byte order mark at the start; it is not part of the first heading.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (parsed.data.length === 0) throw new Error("The file is empty.");
  return parsed.data.map((row) => row.map(cellText));
};
