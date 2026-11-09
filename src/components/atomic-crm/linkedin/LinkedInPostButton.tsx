import { useState } from "react";
import { useNotify } from "ra-core";
import { ExternalLink, Linkedin } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { linkedInPostUrl, photoNote, useLinkedIn } from "./useLinkedIn";
import { useLinkedInPages, type LinkedInPage } from "./useLinkedInPages";

// Posts a ReplyFlow post to the signed-in person's own LinkedIn profile, or takes it down again.
export const LinkedInPostButton = ({ postId }: { postId: number }) => {
  const notify = useNotify();
  const navigate = useNavigate();
  const { sent, refetch } = useLinkedIn();
  const [busy, setBusy] = useState(false);
  const onLinkedIn = sent.find((s) => s.post_id === postId);

  const run = async (action: "publish" | "remove") => {
    setBusy(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { photo?: string };
    }>("linkedin_post", { method: "POST", body: { id: postId, action } });
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
        ? `Posted to your LinkedIn${photoNote(data?.data?.photo)}`
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

// One button per connected company Page: post to it, or see and remove the post.
const PagePostButton = ({
  postId,
  page,
  urn,
  onChanged,
}: {
  postId: number;
  page: LinkedInPage;
  urn: string | null;
  onChanged: () => void;
}) => {
  const notify = useNotify();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async (action: "publish" | "remove") => {
    setBusy(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { photo?: string };
    }>("linkedin_page_post", {
      method: "POST",
      body: { id: postId, action, org_id: page.org_id },
    });
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
        ? `Posted to ${page.name} on LinkedIn${photoNote(data?.data?.photo)}`
        : `Removed from ${page.name}`,
    );
    onChanged();
  };

  if (urn) {
    return (
      <>
        <Button asChild size="sm" variant="ghost">
          <a href={linkedInPostUrl(urn)} target="_blank" rel="noreferrer">
            <ExternalLink /> On {page.name}
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run("remove")}
        >
          Remove from {page.name}
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
      <Linkedin /> Post to {page.name}
    </Button>
  );
};

export const LinkedInPagePostButtons = ({ postId }: { postId: number }) => {
  const { pages, sent, refetch } = useLinkedInPages();
  return (
    <>
      {pages.map((page) => (
        <PagePostButton
          key={page.org_id}
          postId={postId}
          page={page}
          urn={
            sent.find((s) => s.post_id === postId && s.org_id === page.org_id)
              ?.urn ?? null
          }
          onChanged={refetch}
        />
      ))}
    </>
  );
};
