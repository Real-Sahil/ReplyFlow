import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanAccess } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";

type Account = { id: string; name: string; currency: string; status: string };
type Row = {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  costPerClick: number | null;
};
type Report = {
  currency: string;
  rows: Row[];
  totals: Omit<Row, "id" | "name" | "status">;
};

class AdsError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const call = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "linkedin_ads",
    { method: "POST", body },
  );
  if (error) {
    const details = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string; code?: string }
      | undefined;
    throw new AdsError(
      details?.message ?? "Could not reach LinkedIn right now.",
      details?.code,
    );
  }
  return data.data as T;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

// The ad account's own currency as LinkedIn reports it. If LinkedIn gives none, the business's own
// currency is used, never a guess.
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
const count = (value: number) => value.toLocaleString("en-GB");
const percent = (value: number | null) =>
  value === null ? "–" : `${(value * 100).toFixed(2)}%`;

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-xl font-semibold tabular-nums">{value}</span>
  </div>
);

const Problem = ({ error }: { error: AdsError }) => (
  <Card>
    <CardContent className="flex flex-col gap-2 text-sm">
      <p role="alert">{error.message}</p>
      {["needs_ads_connect", "expired"].includes(error.code ?? "") ? (
        <Link to="/linkedin" className="font-medium underline">
          Go to the LinkedIn connection
        </Link>
      ) : null}
    </CardContent>
  </Card>
);

const AdsReport = () => {
  const { currency: businessCurrency } = useConfigurationContext();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const accounts = useQuery({
    queryKey: ["linkedin_ads", "accounts"],
    queryFn: () => call<{ accounts: Account[] }>({ action: "accounts" }),
    retry: false,
  });
  const list = accounts.data?.accounts ?? [];
  const chosen = accountId ?? list[0]?.id ?? null;

  const report = useQuery({
    queryKey: ["linkedin_ads", "report", chosen, days],
    enabled: !!chosen,
    retry: false,
    queryFn: () => {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86_400_000);
      return call<Report>({
        action: "report",
        account_id: chosen,
        start: isoDay(start),
        end: isoDay(end),
      });
    },
  });

  if (accounts.error) return <Problem error={accounts.error as AdsError} />;
  if (accounts.isPending) {
    return <p className="text-sm text-muted-foreground">Asking LinkedIn…</p>;
  }
  if (!list.length) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          This LinkedIn account can't see any ad accounts. Connect with an
          account that has a role on your company's ad account.
        </CardContent>
      </Card>
    );
  }

  const data = report.data;
  const currency =
    data?.currency ||
    list.find((a) => a.id === chosen)?.currency ||
    businessCurrency;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Ad account"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={chosen ?? ""}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.status && a.status !== "ACTIVE"
                ? ` (${a.status.toLowerCase().replace("_", " ")})`
                : ""}
            </option>
          ))}
        </select>
        <select
          aria-label="Period"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {list.length === 1
          ? "1 ad account found."
          : `${list.length} ad accounts found.`}{" "}
        Only ad accounts that the connected LinkedIn account has a role on are
        listed. Company Pages are connected separately, on the LinkedIn screen.
      </p>

      {report.error ? <Problem error={report.error as AdsError} /> : null}
      {report.isPending && chosen ? (
        <p className="text-sm text-muted-foreground">Loading results…</p>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Stat label="Spent" value={money(data.totals.spend, currency)} />
              <Stat label="Views" value={count(data.totals.impressions)} />
              <Stat label="Clicks" value={count(data.totals.clicks)} />
              <Stat label="Click rate" value={percent(data.totals.ctr)} />
              <Stat
                label="Cost per click"
                value={
                  data.totals.costPerClick === null
                    ? "–"
                    : money(data.totals.costPerClick, currency)
                }
              />
            </CardContent>
          </Card>
          <Card className="gap-0 overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2.5">Campaign</th>
                  <th className="px-4 py-2.5 text-right">Spent</th>
                  <th className="px-4 py-2.5 text-right">Views</th>
                  <th className="px-4 py-2.5 text-right">Clicks</th>
                  <th className="px-4 py-2.5 text-right">Click rate</th>
                  <th className="px-4 py-2.5 text-right">Cost per click</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.status.toLowerCase()}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {money(r.spend, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {count(r.impressions)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {count(r.clicks)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {percent(r.ctr)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.costPerClick === null
                        ? "–"
                        : money(r.costPerClick, currency)}
                    </td>
                  </tr>
                ))}
                {!data.rows.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      This ad account has no campaigns.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}
    </div>
  );
};

export const LinkedInAdsPage = () => (
  <div className="mx-auto flex max-w-5xl flex-col gap-4">
    <div>
      <h1 className="text-2xl font-semibold">LinkedIn ads</h1>
      <p className="text-sm text-muted-foreground">
        Read-only results from your LinkedIn ad account. ReplyFlow never creates
        or changes an ad.
      </p>
    </div>
    <CanAccess
      resource="configuration"
      action="edit"
      accessDenied={
        <p className="text-sm text-muted-foreground">
          Only administrators can see ad results.
        </p>
      }
    >
      <AdsReport />
    </CanAccess>
  </div>
);
