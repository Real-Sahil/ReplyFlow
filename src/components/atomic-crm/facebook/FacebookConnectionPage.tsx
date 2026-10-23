import { ConnectFacebookCard } from "./ConnectFacebookCard";
import { MetaPagesCard } from "./MetaPagesCard";
import { useCallback, useEffect, useState } from "react";
import { useNotify } from "ra-core";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";

type CheckItem = { name: string; why: string; ok: boolean };
type Status = {
  circuit?: {
    blocked: boolean;
    reason: string | null;
    blocked_at: string | null;
  };
  source: "app" | "connected" | "secret" | "none";
  secrets: { app_secret: boolean; verify_token: boolean };
  token_valid: boolean;
  problem: string | null;
  page?: { id: string; name: string } | null;
  saved_at?: string | null;
  expiry?: {
    never: boolean;
    at: string | null;
    daysLeft: number | null;
  } | null;
  permissions: CheckItem[];
  subscriptions: CheckItem[];
};

const call = async (action: string, token?: string): Promise<Status> => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "meta_connection",
    {
      method: "POST",
      body: { action, token },
    },
  );
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(
      details.message || "Could not reach the connection service",
    );
  }
  return data.data as Status;
};

const Row = ({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: string;
  detail?: string;
}) => (
  <div className="flex items-start gap-3 py-1.5">
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        ok
          ? "bg-emerald-500/15 text-emerald-600"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
    </span>
    <div className="min-w-0 text-sm">
      <div className="font-medium">{title}</div>
      {detail && <div className="text-muted-foreground">{detail}</div>}
    </div>
  </div>
);

export const FacebookConnectionPage = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await call("status"));
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setSaving(true);
    try {
      setStatus(await call("save_token", token));
      setToken("");
      notify("Token saved");
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const missingPermissions = status?.permissions.filter((p) => !p.ok) ?? [];
  const missingSubscriptions = status?.subscriptions.filter((s) => !s.ok) ?? [];

  return (
    <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-4">
      <ConnectFacebookCard />
      <MetaPagesCard />
      <div className="flex items-center">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">
          Facebook connection
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn(loading && "animate-spin")} /> Check again
        </Button>
      </div>

      {status?.circuit?.blocked && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col gap-3">
            <h6 className="text-lg font-semibold text-destructive">
              Facebook has blocked this Page
            </h6>
            <p className="text-sm">
              Meta reported an action block (error 368). Every feature has
              stopped sending to Facebook so the block is not made worse. Check
              the Page in Facebook first, then clear the block here.
            </p>
            {status.circuit.reason && (
              <p className="text-xs text-muted-foreground">
                Meta said: {status.circuit.reason}
              </p>
            )}
            <div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    setStatus(await call("clear_block"));
                    notify("Block cleared. Sending can resume.");
                  } catch (error) {
                    notify((error as Error).message, { type: "error" });
                  }
                }}
              >
                I've checked Facebook: clear the block
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-1">
          <h6 className="mb-1 text-lg font-semibold">Status</h6>
          {!status && (
            <p className="text-sm text-muted-foreground">Checking…</p>
          )}
          {status && (
            <>
              <Row
                ok={status.token_valid}
                title={
                  status.token_valid
                    ? `Connected to ${status.page?.name ?? "your Page"}`
                    : "Not connected"
                }
                detail={
                  status.problem ??
                  (status.source === "connected"
                    ? "Connected with Facebook Login. Tokens are stored encrypted."
                    : status.source === "app"
                      ? "Token pasted by hand"
                      : status.source === "secret"
                        ? "Token set as a Supabase secret"
                        : undefined)
                }
              />
              {status.expiry && (
                <Row
                  ok={status.expiry.never || (status.expiry.daysLeft ?? 0) > 7}
                  title={
                    status.expiry.never
                      ? "Token does not expire"
                      : `Token expires in ${status.expiry.daysLeft} days`
                  }
                />
              )}
              <Row
                ok={status.secrets.app_secret}
                title="App secret is set (checks incoming messages)"
              />
              <Row
                ok={status.secrets.verify_token}
                title="Verify token is set (webhook handshake)"
              />
            </>
          )}
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h6 className="text-lg font-semibold">What the token allows</h6>
              {missingPermissions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {missingPermissions.length} missing. Add them in Meta first,
                  then generate a new token below.
                </p>
              )}
              {status.permissions.map((p) => (
                <Row key={p.name} ok={p.ok} title={p.name} detail={p.why} />
              ))}
            </div>
            <div>
              <h6 className="text-lg font-semibold">Page subscriptions</h6>
              {missingSubscriptions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Tick the missing fields under Messenger API settings, Add
                  Subscriptions.
                </p>
              )}
              {status.subscriptions.map((s) => (
                <Row key={s.name} ok={s.ok} title={s.name} detail={s.why} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <details className="rounded-xl border bg-card text-card-foreground">
        <summary className="cursor-pointer p-4 text-sm font-medium">
          Advanced: paste a Page token by hand (only if Connect Facebook cannot
          be used)
        </summary>
        <Card className="rounded-t-none border-0 border-t shadow-none">
          <CardContent className="flex flex-col gap-3">
            <h6 className="text-lg font-semibold">Add or replace the token</h6>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              <li>
                Open your app in{" "}
                <a
                  className="inline-flex items-center gap-1 text-primary"
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Meta for Developers <ExternalLink className="size-3" />
                </a>
                , then <b>Use cases</b>.
              </li>
              <li>
                Add any missing permissions from the list above (Customize on
                each use case).
              </li>
              <li>
                Open <b>Customize</b> on Messenger, then{" "}
                <b>Messenger API Settings</b>. In step 2, next to your Page,
                click <b>Generate token</b>.
              </li>
              <li>
                Copy the whole token and paste it below. It is checked before it
                is saved.
              </li>
            </ol>
            <Input
              type="password"
              autoComplete="off"
              placeholder="Paste the Page access token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={save}
                disabled={saving || token.trim().length < 20}
              >
                Save token
              </Button>
              {status?.source === "app" && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    setStatus(await call("clear_token"));
                    notify("Token removed");
                  }}
                >
                  Remove saved token
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                The token is stored privately and never shown again.
              </span>
            </div>
          </CardContent>
        </Card>
      </details>
    </div>
  );
};
