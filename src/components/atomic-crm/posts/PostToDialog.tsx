import { useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { ExternalLink, Facebook, Linkedin, RotateCw, Send } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { linkedInPostUrl } from "../linkedin/useLinkedIn";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChannelRow } from "./ChannelRow";
import { LinkedInWording } from "./LinkedInWording";
import { sendDestination, syncDestinations } from "./destinationActions";
import {
  platformOf,
  wordingFrom,
  type DestinationRow,
  type Wording,
} from "./destinations";
import type { PostRow } from "./postStatus";
import { useChannels, useDestinations } from "./useDestinations";

// Where a post goes, from the Posts list: the same Facebook Pages and LinkedIn accounts as the editor, for a post that is approved or
// already out. A post can be sent to another channel later, tried again after a failure, or taken down. The
// choices are saved on the post, so they are what was approved.
export const PostToDialog = ({ post }: { post: PostRow }) => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const { data: channels = [] } = useChannels();
  const { forPost, refetch } = useDestinations();
  const rows = forPost(post.id);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [wording, setWording] = useState<Wording>({
    mode: "written",
    text: "",
  });
  const [busy, setBusy] = useState(false);

  const facebook = channels.filter((c) => c.platform === "facebook");
  const linkedin = channels.filter((c) => c.platform === "linkedin");
  const rowFor = (key: string): DestinationRow | undefined =>
    rows.find((r) => r.channel_key === key);

  const openDialog = () => {
    setPicked(
      new Set(
        rows
          .filter((r) => r.state === "planned" || r.state === "failed")
          .map((r) => r.channel_key),
      ),
    );
    setWording(wordingFrom(rows));
    setOpen(true);
  };

  const finish = async (good: number, problems: string[]) => {
    await refetch();
    if (good) {
      notify(`Done for ${good} ${good === 1 ? "place" : "places"}`);
    }
    for (const problem of problems) {
      notify(problem, { type: "warning" });
    }
  };

  // Saves the choices (so they are on the post), then sends each ticked destination now.
  const postNow = async () => {
    setBusy(true);
    try {
      // Only the channels ticked are touched: anything else already scheduled or posted is left exactly as it is.
      await syncDestinations({
        postId: post.id,
        existing: rows.filter((r) => picked.has(r.channel_key)),
        wanted: picked,
        wording,
        action: "publish",
        whenIso: null,
      });
      let good = 0;
      const problems: string[] = [];
      for (const key of picked) {
        const result = await sendDestination(post.id, key, "publish");
        if (result.ok) good++;
        else problems.push(result.text);
      }
      await finish(good, problems);
      setPicked(new Set());
    } catch (e) {
      notify((e as { message?: string }).message ?? "Could not save", {
        type: "error",
      });
    }
    setBusy(false);
  };

  const act = async (key: string, action: "publish" | "remove") => {
    setBusy(true);
    const row = rowFor(key);
    // A LinkedIn post waiting for its time is cancelled by setting it back to planned; nothing is on LinkedIn yet.
    if (
      action === "remove" &&
      row?.state === "scheduled" &&
      platformOf(key) === "linkedin"
    ) {
      const { error } = await getSupabaseClient()
        .from("post_destinations")
        .update({ state: "planned" })
        .eq("id", row.id);
      await finish(error ? 0 : 1, error ? ["Could not cancel it"] : []);
      setBusy(false);
      return;
    }
    const result = await sendDestination(post.id, key, action);
    await finish(result.ok ? 1 : 0, result.ok ? [] : [result.text]);
    setBusy(false);
  };

  const toggle = (key: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // One row of the list for a channel, with what can be done to it: see it, take it down, or try again.
  const rowOf = (channel: (typeof channels)[number]) => {
    const row = rowFor(channel.channel_key);
    const posted = row?.state === "published";
    const isFacebook = channel.platform === "facebook";
    const viewUrl =
      row?.external_id &&
      (isFacebook
        ? `https://www.facebook.com/${row.external_id}`
        : linkedInPostUrl(row.external_id));
    return (
      <ChannelRow
        key={channel.channel_key}
        channel={channel}
        row={row}
        checked={picked.has(channel.channel_key)}
        onCheck={(on) => toggle(channel.channel_key, on)}
        locked={busy || row?.state === "scheduled"}
        actions={
          (posted || row?.state === "scheduled") && viewUrl ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <a href={viewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> View
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void act(channel.channel_key, "remove")}
              >
                {row?.state === "scheduled" ? "Cancel" : "Take down"}
              </Button>
            </>
          ) : row?.state === "failed" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void act(channel.channel_key, "publish")}
            >
              <RotateCw /> Try again
            </Button>
          ) : null
        }
      />
    );
  };

  const wordingLocked = !isAdmin && post.status !== "pending_review";

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Send /> Post to…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Where should this post go?</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {post.message}
            </DialogDescription>
          </DialogHeader>

          <section className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Facebook className="size-4" /> Facebook
            </h3>
            {facebook.length ? (
              <ul className="divide-y rounded-lg border">
                {facebook.map(rowOf)}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No Facebook Page is connected.{" "}
                <Link to="/channels" className="underline">
                  Connect one under Accounts
                </Link>
                .
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              From here a Facebook post goes out straight away. To schedule it
              on Facebook, use the editor.
            </p>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Linkedin className="size-4" /> LinkedIn
            </h3>
            {linkedin.length ? (
              <ul className="divide-y rounded-lg border">
                {linkedin.map(rowOf)}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No LinkedIn account is connected.{" "}
                <Link to="/channels" className="underline">
                  Connect one under Accounts
                </Link>
                .
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              LinkedIn posts go out straight away from here. To post at a set
              time, plan it in the editor.
            </p>
          </section>

          {linkedin.length ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Words for LinkedIn</h3>
              <LinkedInWording
                value={wording}
                onChange={setWording}
                postMessage={post.message}
                productId={post.product_id}
                locked={wordingLocked}
                name={`dialog-${post.id}`}
              />
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              disabled={picked.size === 0 || busy}
              onClick={() => void postNow()}
            >
              <Send />
              {picked.size === 0
                ? "Choose where to post"
                : `Post to ${picked.size} ${picked.size === 1 ? "place" : "places"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
