import { useCallback, useEffect, useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { Copy, Linkedin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { AiWriting } from "../posts/AiWriting";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useLinkedIn } from "./useLinkedIn";
import { useLinkedInPages } from "./useLinkedInPages";

// What reads well on LinkedIn; the server allows up to 3,000.
const COMFORTABLE = 1300;

const errorMessage = async (
  error: { context?: { json?: () => Promise<unknown> } },
  fallback: string,
) => {
  const body = (await error.context?.json?.().catch(() => ({}))) as
    | { message?: string }
    | undefined;
  return body?.message ?? fallback;
};

// The AI writer's LinkedIn version of a post: more measured than the Facebook one, no emoji or hashtags,
// and only the facts and prices already in the post. The person reads and edits it, then an administrator
// posts it to their own profile or to a company Page.
export const LinkedInWriter = ({
  postId,
  message,
  productId,
}: {
  postId: number;
  message: string;
  productId: number | null;
}) => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const { member, refetch: refetchProfile } = useLinkedIn();
  const { pages, refetch: refetchPages } = useLinkedInPages();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);

  const write = useCallback(async () => {
    setWriting(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { message: string };
    }>("post_autopilot", {
      method: "POST",
      body: { channel: "linkedin", message, product_id: productId },
    });
    setWriting(false);
    if (error) {
      notify(
        await errorMessage(error, "The AI writer could not write this one"),
        { type: "error" },
      );
      return;
    }
    setText(data?.data?.message ?? "");
  }, [message, productId, notify]);

  useEffect(() => {
    if (open && !text) void write();
    // Write once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const post = async (target: "profile" | { orgId: string; name: string }) => {
    setBusy(true);
    const profile = target === "profile";
    const { error } = await getSupabaseClient().functions.invoke(
      profile ? "linkedin_post" : "linkedin_page_post",
      {
        method: "POST",
        body: {
          id: postId,
          action: "publish",
          message: text,
          ...(profile ? {} : { org_id: target.orgId }),
        },
      },
    );
    setBusy(false);
    if (error) {
      notify(await errorMessage(error, "Could not reach LinkedIn"), {
        type: "error",
      });
      return;
    }
    notify(
      profile
        ? "Posted to your LinkedIn"
        : `Posted to ${target.name} on LinkedIn`,
    );
    refetchProfile();
    refetchPages();
    setOpen(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied");
    } catch {
      notify("Could not copy. Select the text and copy it by hand.", {
        type: "warning",
      });
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles /> Write for LinkedIn
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Write for LinkedIn</DialogTitle>
            <DialogDescription>
              The AI writer rewrites this post in a voice that suits LinkedIn.
              It uses only what the post and product already say. Read it, edit
              it, then post it.
            </DialogDescription>
          </DialogHeader>

          {writing ? (
            <p className="text-sm text-muted-foreground">
              <AiWriting label="Writing the LinkedIn version…" />
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <Textarea
                aria-label="LinkedIn version"
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p
                className={
                  text.length > COMFORTABLE
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {text.length.toLocaleString("en-GB")} characters
                {text.length > COMFORTABLE
                  ? ". Shorter posts tend to read better on LinkedIn."
                  : ""}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={writing || busy}
              onClick={() => void write()}
            >
              <Sparkles /> Write again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!text || writing}
              onClick={() => void copy()}
            >
              <Copy /> Copy
            </Button>
          </div>

          {isAdmin ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button
                size="sm"
                disabled={!text.trim() || writing || busy || !member}
                title={member ? undefined : "Connect your LinkedIn first"}
                onClick={() => void post("profile")}
              >
                <Linkedin /> Post to my profile
              </Button>
              {pages.map((page) => (
                <Button
                  key={page.org_id}
                  size="sm"
                  disabled={!text.trim() || writing || busy}
                  onClick={() =>
                    void post({ orgId: page.org_id, name: page.name })
                  }
                >
                  <Linkedin /> Post to {page.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Only an administrator can post an edited version. Copy the text
              and ask one to post it, or post the approved text with the
              ordinary LinkedIn button.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
