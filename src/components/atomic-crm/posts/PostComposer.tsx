import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
} from "ra-core";
import { CalendarClock, ImageIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ProductPicker } from "../contacts/MessengerConversation";
import { formatPrice } from "../products/formatPrice";
import { getSupabaseClient } from "../providers/supabase/supabase";

type Post = {
  id: number;
  message: string;
  product_id: number | null;
  image_url: string | null;
  link_url: string | null;
  scheduled_for: string | null;
};

type Product = {
  id: number;
  title: string;
  price_pence: number | null;
  original_price_pence: number | null;
  image_url: string | null;
  source_url: string | null;
};

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

const publish = async (
  id: number,
  action: "publish" | "schedule",
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

export const PostComposer = () => {
  const record = useRecordContext<Post>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const [message, setMessage] = useState(record?.message ?? "");
  const [productId, setProductId] = useState<number | null>(
    record?.product_id ?? null,
  );
  const [imageUrl, setImageUrl] = useState(record?.image_url ?? "");
  const [linkUrl, setLinkUrl] = useState(record?.link_url ?? "");
  const [when, setWhen] = useState(toLocalInput(record?.scheduled_for ?? null));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const data = {
      message: message.trim(),
      product_id: productId,
      image_url: imageUrl.trim() || null,
      link_url: linkUrl.trim() || null,
    };
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

  const run = async (action: "draft" | "publish" | "schedule") => {
    if (!message.trim()) {
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
      } else {
        try {
          await publish(
            id,
            action,
            action === "schedule" ? new Date(when).toISOString() : undefined,
          );
          notify(
            action === "publish"
              ? "Posted to your Page"
              : "Scheduled on Facebook",
          );
        } catch (error) {
          notify(`Saved as a draft. ${(error as Error).message}`, {
            type: "error",
          });
        }
      }
      redirect("list", "page_posts");
    } catch (error) {
      notify((error as Error).message || "Could not save", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <h6 className="text-lg font-semibold">
            {record?.id ? "Edit post" : "New post"}
          </h6>
          <Textarea
            rows={8}
            maxLength={8000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What do you want to say?"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <ImageIcon /> Add a product
            </Button>
            <span className="text-xs text-muted-foreground">
              Fills in the photo, price and website link.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Photo link
              <Input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Website link
              <Input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm md:max-w-xs">
            Schedule for
            <Input
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Facebook schedules between 10 minutes and 30 days ahead.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run("draft")}
            >
              Save draft
            </Button>
            <Button
              variant="outline"
              disabled={busy || !when}
              onClick={() => run("schedule")}
            >
              <CalendarClock /> Schedule
            </Button>
            <Button disabled={busy} onClick={() => run("publish")}>
              <Send /> Post now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit gap-0 overflow-hidden py-0">
        <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </div>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-4/3 w-full object-cover"
          />
        )}
        <div className="whitespace-pre-wrap p-4 text-sm">
          {message || (
            <span className="text-muted-foreground">
              Your post appears here.
            </span>
          )}
          {linkUrl && !message.includes(linkUrl) && (
            <div className="mt-2 break-all text-primary">{linkUrl}</div>
          )}
        </div>
      </Card>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={async (picked) => {
          setPickerOpen(false);
          const { data: product } = await dataProvider.getOne<Product>(
            "products",
            { id: picked.id },
          );
          setProductId(product.id);
          if (product.image_url) setImageUrl(product.image_url);
          if (product.source_url) setLinkUrl(product.source_url);
          setMessage((current) =>
            current.trim() ? current : draftFor(product),
          );
        }}
      />
    </div>
  );
};
