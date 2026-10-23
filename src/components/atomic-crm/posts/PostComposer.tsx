import { useEffect, useMemo, useState } from "react";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
  useRecordContext,
  useRedirect,
} from "ra-core";
import {
  CalendarClock,
  CheckCircle2,
  ImageIcon,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ProductPicker } from "../contacts/MessengerConversation";
import { PagePicker } from "./PagePicker";
import { formatPrice } from "../products/formatPrice";
import { storagePath } from "../providers/supabase/organisationFolder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { AiWriting } from "./AiWriting";
import { PostStatusBadge, type PostRow } from "./postStatus";

type Product = {
  id: number;
  title: string;
  price_pence: number | null;
  original_price_pence: number | null;
  image_url: string | null;
  source_url: string | null;
};

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MEDIA_TYPES = ["image/jpeg", "image/png"];

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const draftFor = (product: Product) => {
  const price =
    product.price_pence != null
      ? `\n${formatPrice(product.price_pence)}${
          product.original_price_pence &&
          product.original_price_pence > product.price_pence
            ? ` (was ${formatPrice(product.original_price_pence)})`
            : ""
        }`
      : "";
  return `${product.title}${price}`;
};

const callPublish = async (
  id: number,
  action: "publish" | "schedule" | "remove",
  scheduledFor?: string,
) => {
  const { error } = await getSupabaseClient().functions.invoke("post_publish", {
    method: "POST",
    body: { id, action, scheduled_for: scheduledFor },
  });
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(details.message || "Facebook did not accept the post");
  }
};

// The AI writer's caption for the chosen product. Nothing is saved until the
// person saves the post themselves.
const callWriteWithAi = async (productId: number): Promise<string> => {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    data: { message: string };
  }>("post_autopilot", {
    method: "POST",
    body: { product_id: productId },
  });
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(
      details.message || "The AI writer could not write this one",
    );
  }
  const message = data?.data?.message;
  if (!message) throw new Error("The AI writer returned nothing. Try again.");
  return message;
};

export const PostComposer = () => {
  const record = useRecordContext<PostRow>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;

  const [message, setMessage] = useState(record?.message ?? "");
  const [pageId, setPageId] = useState<string>(
    (record as { page_id?: string | null } | undefined)?.page_id ?? "",
  );
  const [productId, setProductId] = useState<number | null>(
    record?.product_id ?? null,
  );
  const [imageUrl, setImageUrl] = useState(record?.image_url ?? "");
  const [altText, setAltText] = useState(
    (record as { alt_text?: string | null } | undefined)?.alt_text ?? "",
  );
  const [linkUrl, setLinkUrl] = useState("");
  const [when, setWhen] = useState(toLocalInput(record?.scheduled_for ?? null));
  const [file, setFile] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);

  const localPreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  useEffect(() => {
    if (!productId) return;
    void dataProvider
      .getOne<Product>("products", { id: productId })
      .then(({ data }) => setProduct(data))
      .catch(() => setProduct(null));
  }, [productId, dataProvider]);

  const status = record?.status ?? "draft";
  const editable = ["draft", "failed", "pending_review", "approved"].includes(
    status,
  );
  // Any signed-in staff member can approve; the database records who did.
  const canApprove = status === "pending_review";
  const canPublishNow = isAdmin
    ? ["draft", "failed", "approved"].includes(status)
    : status === "approved";

  const chooseFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!MEDIA_TYPES.includes(picked.type)) {
      notify("Use a JPEG or PNG photo.", { type: "error" });
      return;
    }
    if (picked.size > MAX_MEDIA_BYTES) {
      notify("Photos must be 8 MB or smaller.", { type: "error" });
      return;
    }
    setFile(picked);
  };

  // Uploads the chosen photo to the private bucket and returns its path.
  const uploadMedia = async (): Promise<Partial<PostRow>> => {
    if (!file) return {};
    const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = await storagePath(`${crypto.randomUUID()}/${safe}`);
    const { error } = await getSupabaseClient()
      .storage.from("post-media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    return { media_path: path, media_name: file.name, media_type: file.type };
  };

  const values = async () => ({
    message: message.trim(),
    page_id: pageId || null,
    product_id: productId,
    image_url: imageUrl.trim() || null,
    alt_text: altText.trim() || null,
    link_url: linkUrl.trim() || null,
    ...(file ? await uploadMedia() : {}),
  });

  const save = async (): Promise<number> => {
    const data = await values();
    if (record?.id) {
      await dataProvider.update("page_posts", {
        id: record.id,
        data,
        previousData: record,
      });
      return record.id;
    }
    const { data: created } = await dataProvider.create("page_posts", { data });
    return created.id as number;
  };

  const setStatus = async (next: PostRow["status"]) => {
    if (!record?.id) return;
    await dataProvider.update("page_posts", {
      id: record.id,
      data: { status: next },
      previousData: record,
    });
  };

  const writeWithAi = async () => {
    if (!productId) {
      notify("Add a product first, then the AI writer can use its details.", {
        type: "error",
      });
      return;
    }
    setBusy(true);
    try {
      setMessage(await callWriteWithAi(productId));
      notify("Caption written. Check it before you save.");
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const run = async (
    action: "draft" | "submit" | "approve" | "publish" | "schedule",
  ) => {
    if (action !== "draft" && !message.trim()) {
      notify("Write something first.", { type: "error" });
      return;
    }
    if (action === "schedule" && !when) {
      notify("Choose when it should go out.", { type: "error" });
      return;
    }
    setBusy(true);
    try {
      const id = await save();
      if (action === "draft") {
        notify("Draft saved");
        redirect("list", "page_posts");
        return;
      }
      if (action === "submit") {
        await dataProvider.update("page_posts", {
          id,
          data: { status: "pending_review" },
          previousData: { ...record, id } as PostRow,
        });
        notify("Sent for review");
        redirect("list", "page_posts");
        return;
      }
      if (action === "approve") {
        await setStatus("approved");
        // A post planned in a slot goes to Facebook on approval; no second click.
        if (when) {
          await callPublish(id, "schedule", new Date(when).toISOString());
          notify("Approved and scheduled on Facebook");
        } else {
          notify("Approved. It can now be posted or scheduled.");
        }
        redirect("list", "page_posts");
        return;
      }
      try {
        if (action === "schedule") {
          await callPublish(id, "schedule", new Date(when).toISOString());
          notify("Scheduled on Facebook");
        } else {
          await callPublish(id, "publish");
          notify("Posted to your Page");
        }
      } catch (error) {
        notify((error as Error).message, { type: "error" });
      }
      redirect("list", "page_posts");
    } catch (error) {
      notify((error as Error).message || "Could not save", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const previewImage = localPreview ?? imageUrl;

  return (
    <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h6 className="text-lg font-semibold">
              {record?.id ? "Edit post" : "New post"}
            </h6>
            {record?.id && <PostStatusBadge status={status} />}
          </div>
          {!editable && (
            <p className="text-sm text-muted-foreground">
              This post is{" "}
              {status === "scheduled"
                ? "scheduled on Facebook. Cancel the schedule to change it."
                : "already on Facebook."}
            </p>
          )}
          <PagePicker
            value={pageId}
            onChange={setPageId}
            disabled={!editable}
          />
          <Textarea
            rows={7}
            maxLength={8000}
            value={message}
            disabled={!editable}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What do you want to say?"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!editable}
              onClick={() => setPickerOpen(true)}
            >
              <ImageIcon /> Add a product
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!editable || !productId || busy}
              onClick={() => void writeWithAi()}
            >
              {busy ? (
                <AiWriting label="Writing the caption…" />
              ) : (
                <>
                  <Sparkles /> Write with AI
                </>
              )}
            </Button>
            <label
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent",
                !editable && "pointer-events-none opacity-50",
              )}
            >
              <Upload className="size-4" /> {file ? file.name : "Upload photo"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
            </label>
            {file && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                aria-label="Remove photo"
              >
                <X />
              </Button>
            )}
            {record?.media_path && !file && (
              <span className="text-xs text-muted-foreground">
                Photo saved: {record.media_path.split("/").pop()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Photo link (used if no photo is uploaded)
              <Input
                value={imageUrl}
                disabled={!editable}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              Describe the photo (alt text, read aloud by screen readers)
              <Input
                value={altText}
                maxLength={200}
                disabled={!editable}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="e.g. Grey three-seater sofa with oak legs"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Website link
              <Input
                value={linkUrl}
                disabled={!editable}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm md:max-w-xs">
            Planned or scheduled for
            <Input
              type="datetime-local"
              value={when}
              disabled={!editable}
              onChange={(event) => setWhen(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Facebook schedules between 10 minutes and 30 days ahead.
            </span>
          </label>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {editable && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run("draft")}
              >
                Save draft
              </Button>
            )}
            {editable && !isAdmin && status !== "pending_review" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run("submit")}
              >
                <CheckCircle2 /> Send for review
              </Button>
            )}
            {canApprove && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run("approve")}
              >
                <CheckCircle2 /> {when ? "Approve and schedule" : "Approve"}
              </Button>
            )}
            {editable && (
              <Button
                variant="outline"
                disabled={busy || !when}
                onClick={() => run("schedule")}
              >
                <CalendarClock /> Schedule
              </Button>
            )}
            {canPublishNow && (
              <Button disabled={busy} onClick={() => run("publish")}>
                <Send /> Post now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview in the feed
          </div>
          <div className="mx-4 mb-3 overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center gap-2 p-3">
              <div className="size-8 rounded-full bg-primary/20" />
              <div className="text-sm font-medium">Mere &amp; Row</div>
            </div>
            <div className="whitespace-pre-wrap px-3 pb-3 text-sm">
              {message || (
                <span className="text-muted-foreground">
                  Your post appears here.
                </span>
              )}
              {linkUrl && !message.includes(linkUrl) && (
                <div className="mt-2 break-all text-primary">{linkUrl}</div>
              )}
            </div>
            {previewImage && (
              <div className="aspect-[1.91/1] w-full overflow-hidden bg-muted">
                <img
                  src={previewImage}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              </div>
            )}
          </div>
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Feed photos are cropped to about 1.91:1 on desktop and wider on
            phones, so keep the subject in the centre.
          </p>
        </Card>
        {product && (
          <Card className="gap-0 p-3 text-sm">
            <span className="font-medium">{product.title}</span>
            <span className="text-muted-foreground">
              {product.price_pence != null
                ? formatPrice(product.price_pence)
                : ""}
            </span>
          </Card>
        )}
      </div>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={async (picked) => {
          setPickerOpen(false);
          const { data: chosen } = await dataProvider.getOne<Product>(
            "products",
            { id: picked.id },
          );
          setProductId(chosen.id);
          setProduct(chosen);
          if (chosen.image_url) setImageUrl(chosen.image_url);
          if (chosen.source_url) setLinkUrl(chosen.source_url);
          setMessage((current) =>
            current.trim() ? current : draftFor(chosen),
          );
        }}
      />
    </div>
  );
};
