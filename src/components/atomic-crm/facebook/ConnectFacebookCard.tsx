import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import { Copy, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { listPages } from "./metaPages";

// Asks the server for a Facebook link. The link carries a signed, expiring state, so it
// only works for this app and only until it expires.
const startLink = async (): Promise<string> => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "meta_connect",
    { method: "POST", body: { action: "start" } },
  );
  if (error) {
    const body = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string }
      | undefined;
    throw new Error(body?.message ?? "Could not create the connect link.");
  }
  const url = (data?.data as { url?: string } | undefined)?.url;
  if (!url) throw new Error("Could not create the connect link.");
  return url;
};

// Facebook sends the person back to /#/facebook?connected=2 (or ?connect=cancelled, etc.).
const outcomeFromHash = () => {
  const query = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query);
};

export const ConnectFacebookCard = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: pages = [] } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });
  const connectedCount = pages.length;

  // Show the result of a return from Facebook once, then clear it from the address.
  useEffect(() => {
    const params = outcomeFromHash();
    if (!params.has("connected") && !params.has("connect")) return;
    const connected = Number(params.get("connected") ?? 0);
    if (connected > 0) {
      notify(
        connected === 1
          ? "Facebook Page connected"
          : `${connected} Facebook Pages connected`,
      );
      if (params.get("subscribe_failed")) {
        notify(
          "Some Pages could not be switched on for messages. Check them below.",
          { type: "warning" },
        );
      }
    } else {
      const reasons: Record<string, string> = {
        cancelled: "Connecting was cancelled, so nothing changed.",
        expired: "That link has expired. Ask for a new one.",
        no_pages:
          "No Pages were ticked. Connect again and tick the Pages you manage.",
        page_taken:
          "One of those Pages is already connected to another business, so it was not added. Connect the others, or ask that business to remove it first.",
        failed: "Facebook could not be connected. Try again.",
      };
      notify(
        reasons[params.get("connect") ?? ""] ?? "Facebook was not connected.",
        { type: "error" },
      );
    }
    void queryClient.invalidateQueries({ queryKey: ["meta_pages"] });
    window.history.replaceState(null, "", "#/facebook");
  }, [notify, queryClient]);

  const connectNow = async () => {
    setBusy(true);
    try {
      window.location.assign(await startLink());
    } catch (error) {
      notify((error as Error).message, { type: "error" });
      setBusy(false);
    }
  };

  const makeLink = async () => {
    setBusy(true);
    try {
      setLink(await startLink());
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      notify("Link copied");
    } catch {
      // The field is selectable, so the person can copy it by hand.
      notify("Select the link and copy it", { type: "warning" });
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Connect Facebook</h2>
          <p className="text-sm text-muted-foreground">
            You do not need a developer account or a token. Sign in to Facebook,
            approve ReplyFlow, and tick every Page you manage. You can connect
            more than one Page, and add more later.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={connectNow} disabled={busy}>
            <Facebook />{" "}
            {connectedCount === 0
              ? "Connect Facebook Pages"
              : "Add another Page"}
          </Button>
          <Button variant="outline" onClick={makeLink} disabled={busy}>
            Get a link for a Page admin
          </Button>
        </div>

        {link && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <p className="text-sm">
              Send this link to whoever manages the Page. They open it, approve
              ReplyFlow and tick the Page. It works for 7 days.
            </p>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={copy}>
                <Copy /> Copy link
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
