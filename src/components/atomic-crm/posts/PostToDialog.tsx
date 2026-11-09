import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetIdentity, useNotify } from "ra-core";
import {
  Check,
  Copy,
  ExternalLink,
  Facebook,
  Linkedin,
  Send,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { listPages } from "../facebook/metaPages";
import {
  daysLeft,
  linkedInPostUrl,
  photoNote,
  useLinkedIn,
} from "../linkedin/useLinkedIn";
import { useLinkedInPages } from "../linkedin/useLinkedInPages";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { AiWriting } from "./AiWriting";
import type { PostRow } from "./postStatus";

// What reads well on LinkedIn; the server allows up to 3,000.
const COMFORTABLE = 1300;

type Outcome = { ok: boolean; text: string };

const failure = async (
  error: { context?: { json?: () => Promise<unknown> } },
  fallback: string,
) => {
  const body = (await error.context?.json?.().catch(() => ({}))) as
    | { message?: string }
    | undefined;
  return body?.message ?? fallback;
};

const Section = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-1">
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {icon} {title}
    </h3>
    <ul className="divide-y rounded-lg border">{children}</ul>
  </section>
);

const Row = ({
  checked,
  onCheck,
  title,
  sub,
  disabled,
  action,
}: {
  checked?: boolean;
  onCheck?: (on: boolean) => void;
  title: string;
  sub: ReactNode;
  disabled?: boolean;
  action?: ReactNode;
}) => (
  <li className="flex items-center justify-between gap-3 px-3 py-2">
    <label className="flex min-w-0 items-center gap-3">
      {onCheck ? (
        <input
          type="checkbox"
          className="size-4 shrink-0"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onCheck(e.target.checked)}
        />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </label>
    <div className="flex shrink-0 items-center gap-1">{action}</div>
  </li>
);

// One place that says where a post goes. Facebook shows where the post stands (it is posted or scheduled from
// the editor, which also picks the Page and the time); LinkedIn lists your profile and each connected company
// Page, so the post can be sent to any of them, with the post's own words or a LinkedIn version from the AI writer.
export const PostToDialog = ({ post }: { post: PostRow }) => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const { member, sent: onProfile, refetch: refetchProfile } = useLinkedIn();
  const { pages, sent: onPages, refetch: refetchPages } = useLinkedInPages();
  const { data: facebookPages = [] } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState<"written" | "linkedin">("written");
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const profileUrn = onProfile.find((s) => s.post_id === post.id)?.urn ?? null;
  const pageUrn = (orgId: string) =>
    onPages.find((s) => s.post_id === post.id && s.org_id === orgId)?.urn ??
    null;
  const profileExpired = !!member && daysLeft(member.expires_at) === 0;

  const facebookPage =
    facebookPages.find(
      (p) => p.page_id === (post as { page_id?: string | null }).page_id,
    ) ?? facebookPages.find((p) => p.is_default);
  const facebookState =
    post.status === "published" && post.fb_post_id
      ? "On Facebook"
      : post.status === "scheduled"
        ? "Scheduled on Facebook"
        : "Not on Facebook yet";

  const toggle = (key: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const write = useCallback(async () => {
    setWriting(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { message: string };
    }>("post_autopilot", {
      method: "POST",
      body: {
        channel: "linkedin",
        message: post.message,
        product_id: post.product_id,
      },
    });
    setWriting(false);
    if (error) {
      notify(await failure(error, "The AI writer could not write this one"), {
        type: "error",
      });
      return false;
    }
    setText(data?.data?.message ?? "");
    return true;
  }, [post.message, post.product_id, notify]);

  const chooseVersion = async (next: "written" | "linkedin") => {
    setVersion(next);
    if (next === "linkedin" && !text) await write();
  };

  const send = async (key: string, action: "publish" | "remove") => {
    const isProfile = key === "profile";
    const orgId = key.replace("page:", "");
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { photo?: string };
    }>(isProfile ? "linkedin_post" : "linkedin_page_post", {
      method: "POST",
      body: {
        id: post.id,
        action,
        ...(isProfile ? {} : { org_id: orgId }),
        ...(action === "publish" && version === "linkedin" && isAdmin
          ? { message: text }
          : {}),
      },
    });
    if (error) {
      return {
        ok: false,
        text: await failure(error, "Could not reach LinkedIn"),
      };
    }
    return {
      ok: true,
      text:
        action === "publish"
          ? `Posted${photoNote(data?.data?.photo)}`
          : "Removed",
    };
  };

  const run = async (keys: string[], action: "publish" | "remove") => {
    setBusy(true);
    const results: Record<string, Outcome> = {};
    for (const key of keys) {
      results[key] = await send(key, action);
    }
    setOutcomes((o) => ({ ...o, ...results }));
    setPicked(new Set());
    refetchProfile();
    refetchPages();
    setBusy(false);
    const good = Object.values(results).filter((r) => r.ok).length;
    const bad = keys.length - good;
    notify(
      bad === 0
        ? action === "publish"
          ? `Posted to ${good} ${good === 1 ? "place" : "places"}`
          : "Removed"
        : `${good} done, ${bad} could not be completed. See the list.`,
      { type: bad ? "warning" : "success" },
    );
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

  const outcome = (key: string) =>
    outcomes[key]?.text ? (
      <span className={outcomes[key].ok ? "text-primary" : "text-destructive"}>
        {" "}
        · {outcomes[key].text}
      </span>
    ) : null;

  const editedNeedsAdmin = version === "linkedin" && !isAdmin;
  const canPost =
    picked.size > 0 &&
    !busy &&
    !writing &&
    !editedNeedsAdmin &&
    (version === "written" || text.trim().length > 0);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
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

          <Section icon={<Facebook className="size-4" />} title="Facebook">
            <Row
              title={facebookPage?.name || "Your Facebook Page"}
              sub={facebookState}
              action={
                <>
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
                  {post.status !== "published" &&
                  post.status !== "scheduled" ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/page_posts/${post.id}`}>Open editor</Link>
                    </Button>
                  ) : null}
                </>
              }
            />
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Facebook is posted or scheduled, and its Page and time chosen, in
              the post's editor.
            </li>
          </Section>

          <Section icon={<Linkedin className="size-4" />} title="LinkedIn">
            {member ? (
              profileUrn ? (
                <Row
                  title={`Your profile (${member.name || "you"})`}
                  sub={<>On your profile{outcome("profile")}</>}
                  action={
                    <>
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={linkedInPostUrl(profileUrn)}
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
                        onClick={() => void run(["profile"], "remove")}
                      >
                        Remove
                      </Button>
                    </>
                  }
                />
              ) : (
                <Row
                  checked={picked.has("profile")}
                  onCheck={(on) => toggle("profile", on)}
                  disabled={profileExpired}
                  title={`Your profile (${member.name || "you"})`}
                  sub={
                    profileExpired ? (
                      <>
                        Connection expired.{" "}
                        <Link to="/linkedin" className="underline">
                          Connect again
                        </Link>
                      </>
                    ) : (
                      <>Not posted yet{outcome("profile")}</>
                    )
                  }
                />
              )
            ) : (
              <Row
                title="Your profile"
                sub={
                  <>
                    Not connected.{" "}
                    <Link to="/linkedin" className="underline">
                      Connect LinkedIn
                    </Link>
                  </>
                }
              />
            )}

            {pages.map((page) => {
              const key = `page:${page.org_id}`;
              const urn = pageUrn(page.org_id);
              const expired = daysLeft(page.expires_at) === 0;
              return urn ? (
                <Row
                  key={key}
                  title={page.name}
                  sub={<>On this Page{outcome(key)}</>}
                  action={
                    <>
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={linkedInPostUrl(urn)}
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
                        onClick={() => void run([key], "remove")}
                      >
                        Remove
                      </Button>
                    </>
                  }
                />
              ) : (
                <Row
                  key={key}
                  checked={picked.has(key)}
                  onCheck={(on) => toggle(key, on)}
                  disabled={expired}
                  title={page.name}
                  sub={
                    expired ? (
                      <>
                        Connection expired.{" "}
                        <Link to="/linkedin" className="underline">
                          Connect again
                        </Link>
                      </>
                    ) : (
                      <>Company Page · not posted yet{outcome(key)}</>
                    )
                  }
                />
              );
            })}
            {!pages.length ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                No company Page connected. An administrator can connect one on
                the{" "}
                <Link to="/linkedin" className="underline">
                  LinkedIn screen
                </Link>
                .
              </li>
            ) : null}
            <li className="px-3 py-2 text-xs text-muted-foreground">
              LinkedIn posts go out straight away; they cannot be scheduled.
            </li>
          </Section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">What to post on LinkedIn</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`version-${post.id}`}
                  checked={version === "written"}
                  onChange={() => void chooseVersion("written")}
                />
                The post as written
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`version-${post.id}`}
                  checked={version === "linkedin"}
                  onChange={() => void chooseVersion("linkedin")}
                />
                A LinkedIn version from the AI writer
              </label>
            </div>
            {version === "linkedin" ? (
              writing ? (
                <p className="text-sm text-muted-foreground">
                  <AiWriting label="Writing the LinkedIn version…" />
                </p>
              ) : (
                <>
                  <Textarea
                    aria-label="LinkedIn version"
                    rows={7}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        text.length > COMFORTABLE
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {text.length.toLocaleString("en-GB")} characters
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void write()}
                    >
                      <Sparkles /> Write again
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!text}
                      onClick={() => void copy()}
                    >
                      <Copy /> Copy
                    </Button>
                  </div>
                  {!isAdmin ? (
                    <p className="text-xs text-muted-foreground">
                      Only an administrator can post an edited version. Copy it
                      and ask one to post it, or choose "The post as written".
                    </p>
                  ) : null}
                </>
              )
            ) : null}
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {Object.values(outcomes).some((o) => o.ok) ? (
                <>
                  <Check /> Done
                </>
              ) : (
                "Close"
              )}
            </Button>
            <Button
              disabled={!canPost}
              onClick={() => void run([...picked], "publish")}
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
