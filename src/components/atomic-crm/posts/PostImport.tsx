import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetIdentity, useNotify, useRedirect } from "ra-core";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  checkDrafts,
  parseCsv,
  type DraftRow,
  type DraftProblem,
} from "./draftImport";

type Listing = { id: number; reference: string; image_url: string | null };

// Bulk drafts from a spreadsheet. Each valid row becomes a draft for review; nothing is
// published or scheduled from here.
export const PostImport = () => {
  const notify = useNotify();
  const redirect = useRedirect();
  const { identity } = useGetIdentity();
  const [result, setResult] = useState<{
    drafts: DraftRow[];
    problems: DraftProblem[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: listings = [] } = useQuery({
    queryKey: ["listings_for_import"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("id, reference, image_url")
        .eq("active", true)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    const known = new Set(listings.map((l) => l.reference.toLowerCase()));
    setResult(checkDrafts(parseCsv(text), known));
  };

  const create = async () => {
    if (!result || result.drafts.length === 0) return;
    setSaving(true);
    const byRef = new Map(listings.map((l) => [l.reference.toLowerCase(), l]));
    const rows = result.drafts.map((d) => {
      const listing = byRef.get(d.reference.toLowerCase());
      return {
        message: d.caption,
        product_id: listing?.id ?? null,
        image_url: listing?.image_url ?? null,
        alt_text: d.alt_text,
        status: "draft",
        source: "manual",
        created_by: Number(identity?.id) || null,
      };
    });
    const { error } = await getSupabaseClient().from("page_posts").insert(rows);
    setSaving(false);
    if (error) {
      notify("The drafts could not be created. Nothing was saved.", {
        type: "error",
      });
      return;
    }
    notify(
      `${rows.length} ${rows.length === 1 ? "draft" : "drafts"} created for review`,
    );
    redirect("/page_posts");
  };

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <h1 className="text-2xl font-semibold tracking-tight">Import drafts</h1>
      <p className="text-sm text-muted-foreground">
        Upload a CSV with the columns <code>reference</code>,{" "}
        <code>caption</code> and, optionally, <code>alt_text</code> (up to 200
        characters). Each row becomes a draft for review. Nothing is published
        or scheduled from here.
      </p>

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent">
        <FileUp className="size-4" /> Choose a CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </label>

      {result && (
        <section className="flex flex-col gap-3">
          <p className="text-sm">
            <strong>{result.drafts.length}</strong> ready to create
            {result.problems.length > 0 && (
              <>
                , <strong>{result.problems.length}</strong> need fixing (nothing
                from the file is saved until you fix or remove them)
              </>
            )}
            .
          </p>
          {result.problems.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {result.problems.map((p) => (
                <li key={`${p.line}-${p.message}`}>
                  Row {p.line}: {p.message}
                </li>
              ))}
            </ul>
          )}
          {result.drafts.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {result.drafts.map((d) => (
                <li key={d.line} className="flex flex-col gap-1 p-3">
                  <span className="font-medium">{d.reference}</span>
                  <span className="whitespace-pre-line break-words text-muted-foreground">
                    {d.caption}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button
              onClick={create}
              disabled={
                saving ||
                result.problems.length > 0 ||
                result.drafts.length === 0
              }
            >
              {saving ? "Creating…" : `Create ${result.drafts.length} drafts`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};
