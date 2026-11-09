import { useState } from "react";
import { useNotify } from "ra-core";
import { ExternalLink, Linkedin } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { linkedInPostUrl, useLinkedIn } from "./useLinkedIn";

// Posts a ReplyFlow post to the signed-in person's own LinkedIn profile, or takes it down again.
export const LinkedInPostButton = ({ postId }: { postId: number }) => {
  const notify = useNotify();
  const navigate = useNavigate();
  const { sent, refetch } = useLinkedIn();
  const [busy, setBusy] = useState(false);
  const onLinkedIn = sent.find((s) => s.post_id === postId);

  const run = async (action: "publish" | "remove") => {
    setBusy(true);
    const { error } = await getSupabaseClient().functions.invoke(
      "linkedin_post",
      { method: "POST", body: { id: postId, action } },
    );
    setBusy(false);
    if (error) {
      const body = (await error.context?.json?.().catch(() => ({}))) as
        | { message?: string; code?: string }
        | undefined;
      notify(body?.message ?? "Could not reach LinkedIn", { type: "error" });
      if (body?.code === "not_connected" || body?.code === "expired") {
        navigate("/linkedin");
      }
      return;
    }
    notify(
      action === "publish"
        ? "Posted to your LinkedIn"
        : "Removed from your LinkedIn",
    );
    refetch();
  };

  if (onLinkedIn) {
    return (
      <>
        <Button asChild size="sm" variant="ghost">
          <a
            href={linkedInPostUrl(onLinkedIn.urn)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> On LinkedIn
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run("remove")}
        >
          Remove from LinkedIn
        </Button>
      </>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => run("publish")}
    >
      <Linkedin /> Post to LinkedIn
    </Button>
  );
};
