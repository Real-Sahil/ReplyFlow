import { useEffect, useState } from "react";
import { CanAccess, useNotify } from "ra-core";
import { Building2, ChartColumn, Link2, Unplug } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { daysLeft, hasAdsScope, useLinkedIn } from "./useLinkedIn";
import { useLinkedInPages } from "./useLinkedInPages";

const REASONS: Record<string, string> = {
  cancelled: "Connecting was cancelled, so nothing changed.",
  expired: "That link has expired. Press Connect to start again.",
  scope:
    "LinkedIn did not give ReplyFlow permission to read your name. Connect again and allow it.",
  failed: "LinkedIn could not be connected. Try again in a moment.",
  page_taken:
    "That LinkedIn Page is already connected to another business, so it was not added.",
};

const call = async (
  action: "start" | "disconnect",
  purpose?: "post" | "ads",
) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "linkedin_connect",
    { method: "POST", body: { action, purpose } },
  );
  if (error) {
    const body = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string }
      | undefined;
    throw new Error(body?.message ?? "Could not reach LinkedIn right now.");
  }
  return data?.data as { url?: string } | undefined;
};

const callPages = async (
  body: { action: "start" } | { action: "disconnect"; org_id: string },
) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "linkedin_pages_connect",
    { method: "POST", body },
  );
  if (error) {
    const details = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string }
      | undefined;
    throw new Error(details?.message ?? "Could not reach LinkedIn right now.");
  }
  return data?.data as { url?: string } | undefined;
};

// LinkedIn sends the person back to /#/linkedin?connected=1 (or ?connect=cancelled and so on).
const outcome = () =>
  new URLSearchParams(window.location.hash.split("?")[1] ?? "");

export const LinkedInConnectionPage = () => {
  const notify = useNotify();
  const { member, loading, refetch } = useLinkedIn();
  const pages = useLinkedInPages();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = outcome();
    if (
      !params.has("connected") &&
      !params.has("connect") &&
      !params.has("pages")
    )
      return;
    if (params.has("pages")) {
      const n = Number(params.get("pages") ?? 0);
      notify(
        n === 0
          ? "LinkedIn is connected, but that account does not administer any company Pages."
          : n === 1
            ? "LinkedIn Page connected"
            : `${n} LinkedIn Pages connected`,
        n === 0 ? { type: "warning" } : undefined,
      );
      pages.refetch();
    } else if (params.get("connected")) {
      notify("LinkedIn connected");
      refetch();
    } else {
      notify(REASONS[params.get("connect") ?? ""] ?? REASONS.failed, {
        type: "warning",
      });
    }
    window.history.replaceState(null, "", "#/linkedin");
    // Only on arrival from LinkedIn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (purpose: "post" | "ads" = "post") => {
    setBusy(true);
    try {
      const result = await call("start", purpose);
      if (!result?.url) throw new Error("Could not start the connection.");
      window.location.href = result.url;
    } catch (e) {
      notify((e as Error).message, { type: "error" });
      setBusy(false);
    }
  };

  const connectPages = async () => {
    setBusy(true);
    try {
      const result = await callPages({ action: "start" });
      if (!result?.url) throw new Error("Could not start the connection.");
      window.location.href = result.url;
    } catch (e) {
      notify((e as Error).message, { type: "error" });
      setBusy(false);
    }
  };

  const disconnectPage = async (orgId: string) => {
    setBusy(true);
    try {
      await callPages({ action: "disconnect", org_id: orgId });
      notify("LinkedIn Page disconnected");
      pages.refetch();
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    }
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await call("disconnect");
      notify("LinkedIn disconnected");
      refetch();
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    }
    setBusy(false);
  };

  const left = member ? daysLeft(member.expires_at) : 0;
  const expired = !!member && left === 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">LinkedIn</h1>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Connect your own LinkedIn account to post from ReplyFlow to your
            profile. Posts go out as you, only when you press the button on a
            post that has been approved. Text and a link are sent; photos are
            not sent to LinkedIn yet.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : member ? (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {expired
                  ? "Your LinkedIn connection has expired"
                  : `Connected as ${member.name || "your LinkedIn account"}`}
              </p>
              <p className="text-muted-foreground">
                {expired
                  ? "Connect again to keep posting."
                  : left <= 7
                    ? `It stops working in ${left} ${left === 1 ? "day" : "days"}. Connect again soon.`
                    : `Works for about ${left} more days. LinkedIn asks you to connect again every two months or so.`}
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium">Not connected</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => connect("post")}>
              <Link2 />
              {member ? "Connect again" : "Connect LinkedIn"}
            </Button>
            {member ? (
              <Button variant="outline" disabled={busy} onClick={disconnect}>
                <Unplug /> Disconnect
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            ReplyFlow asks LinkedIn only for your name and permission to post
            for you. Your sign-in token is stored encrypted on the server and
            never shown in the app. Disconnecting removes it.
          </p>
        </CardContent>
      </Card>

      <CanAccess resource="configuration" action="edit">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="font-medium">Ads report</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                See what your LinkedIn campaigns spent and what they got: views,
                clicks and cost per click. It is read-only: ReplyFlow never
                creates or changes an ad. This needs an extra permission, so you
                connect again once, with a LinkedIn account that can see your ad
                account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {member && hasAdsScope(member.scopes) && !expired ? (
                <Button asChild>
                  <Link to="/linkedin_ads">
                    <ChartColumn /> Open the ads report
                  </Link>
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => connect("ads")}>
                  <Link2 /> Connect for ads reports
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </CanAccess>

      <CanAccess resource="configuration" action="edit">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="font-medium">Company Page</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Post to your business's LinkedIn Page, not just to your own
                profile. Any member of staff can then post an approved post to
                the Page from the Posts screen. You need to be an administrator
                of the Page on LinkedIn.
              </p>
            </div>
            {pages.pages.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {pages.pages.map((page) => {
                  const left = daysLeft(page.expires_at);
                  return (
                    <li
                      key={page.org_id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        <span className="font-medium">{page.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {left === 0
                            ? "expired: connect again"
                            : left <= 7
                              ? `stops working in ${left} ${left === 1 ? "day" : "days"}`
                              : `works for about ${left} more days`}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => disconnectPage(page.org_id)}
                      >
                        <Unplug /> Disconnect
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm font-medium">No Page connected</p>
            )}
            <div>
              <Button disabled={busy} onClick={connectPages}>
                <Building2 />
                {pages.pages.length ? "Connect again" : "Connect a Page"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </CanAccess>
    </div>
  );
};
