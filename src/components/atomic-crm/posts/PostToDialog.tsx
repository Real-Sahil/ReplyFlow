import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

import { listPages } from "../facebook/metaPages";
import { linkedInPostUrl } from "../linkedin/useLinkedIn";
import { ChannelRow } from "./ChannelRow";
import { LinkedInWording } from "./LinkedInWording";
import { sendDestination, syncDestinations } from "./destinationActions";
import { wordingFrom, type DestinationRow, type Wording } from "./destinations";
import type { PostRow } from "./postStatus";
import { useChannels, useDestinations } from "./useDestinations";

// Where a post goes, from the Posts list: the same destinations as the editor, for a post that is approved or
// already out. A post can be sent to another channel later, tried again after a failure, or taken down. The
// choices are saved on the post, so they are what was approved.
export const PostToDialog = ({ post }: { post: PostRow }) => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const { data: channels = [] } = useChannels();
  const { forPost, refetch } = useDestinations();
  const { data: facebookPages = [] } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });
  const rows = forPost(post.id);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [wording, setWording] = useState<Wording>({
    mode: "written",
    text: "",
  });
  const [busy, setBusy] = useState(false);

  const linkedin = channels.filter((c) => c.platform === "linkedin");
  const rowFor = (key: string): DestinationRow | undefined =>
    rows.find((r) => r.channel_key === key);

  const facebookPage =
    facebookPages.find((p) => p.page_id === post.page_id) ??
    facebookPages.find((p) => p.is_default);
  const facebookState =
    post.status === "published" && post.fb_post_id
      ? "On Facebook"
      : post.status === "scheduled"
        ? "Scheduled on Facebook"
        : "Not on Facebook yet";

  const openDialog = () => {
    setPicked(
      new Set(
        rows
          .filter((r) => r.state !== "removed" && r.state !== "published")
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
      notify(`LinkedIn: ${problem}`, { type: "warning" });
    }
  };

  // Saves the choices (so they are on the post), then sends each ticked destination now.
  const postNow = async () => {
    setBusy(true);
    try {
      await syncDestinations({
        postId: post.id,
        existing: rows,
        wanted: new Set([
          ...picked,
          ...rows
            .filter((r) => r.state === "published")
            .map((r) => r.channel_key),
        ]),
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
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {facebookPage?.name || "Your Facebook Page"}
                </p>
                <p className="text-xs text-muted-foreground">{facebookState}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {post.fb_post_id ? (
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={`https://www.facebook.com/${post.fb_post_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink /> View
                    </a>
                  </Button>
                ) : null}
                {post.status !== "published" && post.status !== "scheduled" ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/page_posts/${post.id}`}>Open editor</Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Facebook's Page and time are chosen in the editor.
            </p>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Linkedin className="size-4" /> LinkedIn
            </h3>
            {linkedin.length ? (
              <ul className="divide-y rounded-lg border">
                {linkedin.map((channel) => {
                  const row = rowFor(channel.channel_key);
                  const posted = row?.state === "published";
                  return (
                    <ChannelRow
                      key={channel.channel_key}
                      channel={channel}
                      row={row}
                      checked={picked.has(channel.channel_key)}
                      onCheck={(on) => toggle(channel.channel_key, on)}
                      locked={busy}
                      actions={
                        posted && row?.external_id ? (
                          <>
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={linkedInPostUrl(row.external_id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink /> View
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void act(channel.channel_key, "remove")
                              }
                            >
                              Take down
                            </Button>
                          </>
                        ) : row?.state === "failed" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void act(channel.channel_key, "publish")
                            }
                          >
                            <RotateCw /> Try again
                          </Button>
                        ) : null
                      }
                    />
                  );
                })}
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
