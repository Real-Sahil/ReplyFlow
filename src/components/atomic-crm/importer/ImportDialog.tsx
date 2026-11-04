import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { mapRows, type MapResult, type Spec } from "./engine";
import { readSheetFile } from "./sheet";
import { downloadCsvTemplate, downloadXlsxTemplate } from "./template";

// The two template downloads, for an administrator to give to staff or to fill in themselves.
export const TemplateButtons = <T,>({ spec }: { spec: Spec<T> }) => (
  <div className="flex flex-wrap gap-2">
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void downloadXlsxTemplate(spec)}
    >
      <Download className="size-4" /> Excel template
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => downloadCsvTemplate(spec)}
    >
      <Download className="size-4" /> CSV template
    </Button>
  </div>
);

const MAX_ERRORS_SHOWN = 12;

// Choose a file, see what would be added, and only then add it. If any row is wrong nothing is added,
// and each wrong row is named by its row number in the sheet.
export const ImportDialog = <T,>({
  spec,
  onImport,
  onClose,
  checkDuplicates,
}: {
  spec: Spec<T>;
  onImport: (values: T[]) => Promise<void>;
  onClose: () => void;
  // For each ready row, a sentence when it looks like something already recorded, otherwise null.
  // Those rows are left out unless the person ticks "Send these too".
  checkDuplicates?: (
    values: T[],
  ) => (string | null)[] | Promise<(string | null)[]>;
}) => {
  const notify = useNotify();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<MapResult<T> | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sendAnyway, setSendAnyway] = useState(false);
  const [notes, setNotes] = useState<(string | null)[]>([]);
  const [checkFailed, setCheckFailed] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setReadError(null);
    setSendAnyway(false);
    setNotes([]);
    setCheckFailed(false);
    setReading(true);
    try {
      const mapped = mapRows(await readSheetFile(file), spec);
      // Compare with what is already recorded, but only once the sheet itself is right.
      if (
        checkDuplicates &&
        !mapped.problem &&
        mapped.rows.every((r) => r.errors.length === 0)
      ) {
        try {
          setNotes(await checkDuplicates(mapped.rows.map((r) => r.value as T)));
        } catch {
          setCheckFailed(true);
        }
      }
      setResult(mapped);
    } catch (error) {
      setReadError((error as Error).message);
    } finally {
      setReading(false);
    }
  };

  const ready = (result?.rows ?? []).filter((r) => r.value !== undefined);
  const wrong = (result?.rows ?? []).filter((r) => r.errors.length > 0);
  const similar = ready.filter((_, i) => notes[i]);
  const toSend = sendAnyway ? ready : ready.filter((_, i) => !notes[i]);
  const canImport =
    !!result && !result.problem && wrong.length === 0 && toSend.length > 0;

  const run = useMutation({
    mutationFn: async () => onImport(toSend.map((r) => r.value as T)),
    onSuccess: () => {
      notify(`${toSend.length} added.`);
      onClose();
    },
    onError: (error: Error) =>
      notify(error.message || "Nothing was added. Please try again.", {
        type: "error",
      }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send a sheet: {spec.title}</DialogTitle>
          <DialogDescription>
            Use an Excel (.xlsx) or CSV file. Each row is checked first, and
            nothing is added until every row is right.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
            <span>Start from the template, then fill it in.</span>
            <TemplateButtons spec={spec} />
          </div>

          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
          >
            <FileSpreadsheet className="size-4" />
            {fileName
              ? `Chosen: ${fileName}. Choose another`
              : "Choose your file"}
          </Button>

          {reading ? (
            <p className="text-sm text-muted-foreground">Reading…</p>
          ) : null}
          {readError ? (
            <p role="alert" className="text-sm text-destructive">
              {readError}
            </p>
          ) : null}
          {result?.problem ? (
            <p role="alert" className="text-sm text-destructive">
              {result.problem}
            </p>
          ) : null}

          {result && !result.problem ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                <strong>{ready.length}</strong> ready
                {wrong.length > 0 ? (
                  <>
                    ,{" "}
                    <strong className="text-destructive">{wrong.length}</strong>{" "}
                    need fixing
                  </>
                ) : null}
                {result.examples > 0 ? `. The example row was ignored.` : ""}
                {result.ignoredColumns.length > 0
                  ? ` Columns not used: ${result.ignoredColumns.join(", ")}.`
                  : ""}
              </p>

              {wrong.length > 0 ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 p-3 text-sm"
                >
                  <p className="mb-1 font-medium">
                    Nothing has been added. Fix these in your sheet and choose
                    it again:
                  </p>
                  <ul className="list-disc pl-5">
                    {wrong.slice(0, MAX_ERRORS_SHOWN).map((r) => (
                      <li key={r.row}>
                        <strong>Row {r.row}:</strong> {r.errors.join(" ")}
                      </li>
                    ))}
                  </ul>
                  {wrong.length > MAX_ERRORS_SHOWN ? (
                    <p className="mt-1 text-muted-foreground">
                      …and {wrong.length - MAX_ERRORS_SHOWN} more.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {checkFailed ? (
                <p className="text-sm text-muted-foreground">
                  Could not compare with what is already recorded, so repeats
                  were not checked.
                </p>
              ) : null}
              {similar.length > 0 && wrong.length === 0 ? (
                <div
                  role="status"
                  className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm"
                >
                  <p className="mb-1 font-medium">
                    {similar.length === 1
                      ? "1 row looks like something already recorded:"
                      : `${similar.length} rows look like things already recorded:`}
                  </p>
                  <ul className="list-disc pl-5">
                    {ready.map((r, i) =>
                      notes[i] ? (
                        <li key={r.row}>
                          <strong>Row {r.row}:</strong> {notes[i]}
                        </li>
                      ) : null,
                    )}
                  </ul>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sendAnyway}
                      onChange={(e) => setSendAnyway(e.target.checked)}
                    />
                    Add these too (they are not repeats)
                  </label>
                </div>
              ) : null}

              {ready.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Row</th>
                        {spec.previewHeadings.map((h) => (
                          <th key={h} className="px-2 py-1.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ready.slice(0, 6).map((r) => (
                        <tr key={r.row} className="border-t">
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {r.row}
                          </td>
                          {spec.preview(r.value as T).map((cell, i) => (
                            <td key={i} className="px-2 py-1.5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ready.length > 6 ? (
                    <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">
                      …and {ready.length - 6} more.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              How to fill it in
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {spec.columns.map((c) => (
                <li key={c.key}>
                  <span className="font-medium text-foreground">
                    {c.label}
                    {c.required ? "" : " (optional)"}:
                  </span>{" "}
                  {c.help}
                </li>
              ))}
              {spec.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canImport || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending
              ? "Adding…"
              : `Add ${toSend.length || ""} ${toSend.length === 1 ? "row" : "rows"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
