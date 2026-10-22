import { useMemo, useState } from "react";
import { useGetIdentity, useGetList, useNotify, useRefresh } from "ra-core";
import { CalendarClock, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { formatPrice } from "../products/formatPrice";
import { AiWriting } from "./AiWriting";
import { getSupabaseClient } from "../providers/supabase/supabase";

const MAX_SELECTED = 10;

type Product = {
  id: number;
  title: string;
  price_pence: number | null;
  image_url: string | null;
};

// Pick listings by hand. The AI writes each caption from the listing's own facts,
// checks it, and posts it to review, or, for an administrator, schedules it.
export const PlanWithAi = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const { data } = useGetList<Product>("products", {
    filter: { active: true },
    sort: { field: "created_at", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });

  const listings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data ?? [])
      .filter((p) => p.image_url)
      .filter((p) => !needle || p.title.toLowerCase().includes(needle));
  }, [data, query]);

  const toggle = (id: number) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= MAX_SELECTED) {
        notify(`Choose up to ${MAX_SELECTED} listings at a time.`, {
          type: "error",
        });
        return current;
      }
      return [...current, id];
    });
  };

  const run = async (schedule: boolean) => {
    setBusy(true);
    const { data: result, error } = await getSupabaseClient().functions.invoke<{
      data: { created: number; skipped: string[] };
    }>("post_autopilot", {
      method: "POST",
      body: { action: "draft_selected", product_ids: picked, schedule },
    });
    setBusy(false);
    if (error || !result) {
      notify("The AI writer could not write these. Nothing was saved.", {
        type: "error",
      });
      return;
    }
    const { created, skipped } = result.data;
    const done = schedule
      ? `${created} scheduled. They go out on their slots.`
      : `${created} sent for review.`;
    notify(skipped.length ? `${done} Skipped: ${skipped.join("; ")}` : done, {
      type: skipped.length ? "warning" : "info",
    });
    setPicked([]);
    refresh();
  };

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <ListChecks className="size-4" /> Choose listings
          </h2>
          <p className="text-sm text-muted-foreground">
            Tick the listings to post. The AI writes each caption from the
            listing&rsquo;s own details. You can check every caption before it
            goes out.
          </p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {picked.length} of {MAX_SELECTED} chosen
        </span>
      </div>

      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search listings"
        aria-label="Search listings"
        className="md:max-w-sm"
      />

      <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {listings.map((product) => {
          const checked = picked.includes(product.id);
          return (
            <li key={product.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-2 hover:bg-accent",
                  checked && "border-foreground bg-accent",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(product.id)}
                  aria-label={`Choose ${product.title}`}
                />
                <img
                  src={product.image_url ?? undefined}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-12 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {product.title}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {product.price_pence != null
                      ? formatPrice(product.price_pence)
                      : "No price"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {listings.length === 0 && (
          <li className="p-2 text-sm text-muted-foreground">
            No listings with a photo match this search.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          disabled={busy || picked.length === 0}
          onClick={() => run(false)}
        >
          {busy ? (
            <AiWriting label="Writing captions…" />
          ) : (
            <>
              <Sparkles /> Write for review
            </>
          )}
        </Button>
        {isAdmin && (
          <Button
            disabled={busy || picked.length === 0}
            onClick={() => run(true)}
          >
            <CalendarClock /> Write and schedule
          </Button>
        )}
      </div>
    </Card>
  );
};
