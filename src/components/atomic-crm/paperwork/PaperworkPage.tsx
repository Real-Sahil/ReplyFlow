import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Paperclip, Plus } from "lucide-react";
import { useGetIdentity, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { openReceipt } from "../finance/BillsPage";
import { parseDate } from "../importer/engine";
import { expiryLabel, expiryState } from "../people/people";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { storagePath } from "../providers/supabase/organisationFolder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  DOC_CATEGORY_LABEL,
  docsNeedingAttention,
  type BusinessDocument,
  type DocCategory,
} from "./paperwork";
import { PAPERWORK_KEY, useAssets, useBusinessDocuments } from "./usePaperwork";

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const DocDialog = ({
  doc,
  onClose,
}: {
  doc?: BusinessDocument;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: assets = [] } = useAssets();
  const file = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(doc?.title ?? "");
  const [category, setCategory] = useState<DocCategory>(
    doc?.category ?? "insurance",
  );
  const [provider, setProvider] = useState(doc?.provider ?? "");
  const [reference, setReference] = useState(doc?.reference ?? "");
  const [issued, setIssued] = useState(doc?.issued_on ?? "");
  const [expires, setExpires] = useState(doc?.expires_on ?? "");
  const [assetId, setAssetId] = useState(
    doc?.asset_id ? String(doc.asset_id) : "",
  );
  const [note, setNote] = useState(doc?.note ?? "");
  const [active, setActive] = useState(doc?.active ?? true);
  const [upload, setUpload] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      let file_path = doc?.file_path ?? null;
      if (upload) {
        const ext = upload.name.includes(".")
          ? `.${upload.name.split(".").pop()}`
          : "";
        const path = await storagePath(`${crypto.randomUUID()}${ext}`);
        const { error: uploadError } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, upload);
        if (uploadError) throw new Error("The file could not be uploaded.");
        file_path = path;
      }
      const row = {
        title: title.trim(),
        category,
        provider: provider.trim() || null,
        reference: reference.trim() || null,
        issued_on: issued ? parseDate(issued) : null,
        expires_on: expires ? parseDate(expires) : null,
        asset_id: assetId ? Number(assetId) : null,
        note: note.trim() || null,
        file_path,
        active,
      };
      const { error } = doc
        ? await client.from("business_documents").update(row).eq("id", doc.id)
        : await client.from("business_documents").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAPERWORK_KEY });
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const valid = title.trim().length > 0 && (!expires || !!parseDate(expires));
  const select = "h-9 rounded-md border bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {doc ? "Change this document" : "Add a document"}
          </DialogTitle>
          <DialogDescription>
            Keep the dates here and a copy of the file, and you are reminded
            before it runs out.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="bd-title">What is it</Label>
            <Input
              id="bd-title"
              autoFocus
              placeholder="Public liability insurance"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-cat">Type</Label>
            <select
              id="bd-cat"
              className={select}
              value={category}
              onChange={(e) => setCategory(e.target.value as DocCategory)}
            >
              {(Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]).map((c) => (
                <option key={c} value={c}>
                  {DOC_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-asset">About an item (optional)</Label>
            <select
              id="bd-asset"
              className={select}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Not about one item</option>
              {assets
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-provider">Provider</Label>
            <Input
              id="bd-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-ref">Policy or certificate number</Label>
            <Input
              id="bd-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-issued">Starts</Label>
            <Input
              id="bd-issued"
              type="date"
              value={issued}
              onChange={(e) => setIssued(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-expires">Runs out</Label>
            <Input
              id="bd-expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="bd-note">Note</Label>
            <Input
              id="bd-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <input
              ref={file}
              type="file"
              className="hidden"
              onChange={(e) => setUpload(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => file.current?.click()}
            >
              <Paperclip className="size-4" />
              {upload
                ? upload.name
                : doc?.file_path
                  ? "Replace the copy of the file"
                  : "Add a copy of the file"}
            </Button>
          </div>
          {doc ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Still current (untick when replaced or no longer needed)
            </label>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DocRow = ({
  doc,
  onEdit,
}: {
  doc: BusinessDocument;
  onEdit: () => void;
}) => {
  const today = new Date();
  const state = expiryState(doc.expires_on, today);
  return (
    <li className="flex flex-col gap-1 border-b p-4 last:border-b-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {[DOC_CATEGORY_LABEL[doc.category], doc.provider, doc.reference]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {doc.expires_on ? (
          <span
            className={cn(
              "self-start rounded-md px-1.5 py-0.5 text-xs sm:shrink-0",
              state === "expired" && "bg-destructive/10 text-destructive",
              state === "soon" && "bg-warning-soft text-warning",
              state === "ok" && "text-muted-foreground",
            )}
          >
            {expiryLabel(doc.expires_on, today)} · {day(doc.expires_on)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-1">
        {doc.file_path ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openReceipt(doc.file_path!)}
          >
            <Paperclip className="size-4" /> Open the file
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Change
        </Button>
      </div>
    </li>
  );
};

export const PaperworkPage = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!identity?.administrator;
  const { data: docs = [], isPending, isError } = useBusinessDocuments(isAdmin);
  const [dialog, setDialog] = useState<"new" | BusinessDocument | null>(null);
  if (!identity) return null;
  if (!isAdmin)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );

  const today = new Date();
  const attention = docsNeedingAttention(docs, today);
  const attentionIds = new Set(attention.map((d) => d.id));
  const rest = docs.filter((d) => d.active && !attentionIds.has(d.id));
  const old = docs.filter((d) => !d.active);
  return (
    <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <FileCheck2 className="size-6 text-muted-foreground" /> Paperwork
        </h1>
        <Button size="sm" onClick={() => setDialog("new")}>
          <Plus /> Add a document
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Insurance, licences, certificates, safety checks, vehicle tests and
        contracts, with the dates they run out. You are reminded on Today a
        month before. Staff documents are kept with each person.
      </p>
      {isError ? (
        <p className="text-sm text-muted-foreground">
          This could not be loaded. Please try again.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing here yet. Start with your insurance.
        </p>
      ) : (
        <>
          {attention.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-medium text-destructive">
                Needs attention
              </h2>
              <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {attention.map((d) => (
                  <DocRow key={d.id} doc={d} onEdit={() => setDialog(d)} />
                ))}
              </ul>
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Current
              </h2>
              <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {rest.map((d) => (
                  <DocRow key={d.id} doc={d} onEdit={() => setDialog(d)} />
                ))}
              </ul>
            </section>
          ) : null}
          {old.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                No longer current ({old.length})
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {old.map((d) => (
                  <DocRow key={d.id} doc={d} onEdit={() => setDialog(d)} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {dialog ? (
        <DocDialog
          doc={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
};
