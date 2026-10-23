import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useNotify } from "ra-core";
import { Copy, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { fetchAllRows } from "../exports/exportPaging";
import {
  summariseLinks,
  trackedLinkUrl,
  type ClickRow,
  type EnquiryRow,
  type LinkRow,
} from "./linkReport";

const CAMPAIGN = /^[a-z0-9][a-z0-9-]{0,59}$/;
const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const DAY_MS = 24 * 60 * 60 * 1000;

const newCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
  ).join("");

type Product = { id: number; title: string; source_url: string | null };

// Tracked links for product pages: create a link for a listing, and see the clicks and
// enquiries each campaign has brought in over the last 30 days.
export const TrackedLinksPage = () => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const { data, isPending, error } = useQuery({
    queryKey: ["tracked_links_report"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
      const client = getSupabaseClient();
      const [links, clicks, enquiries] = await Promise.all([
        client
          .from("tracked_links")
          .select("code, utm_campaign, target_url, products(title)")
          .order("created_at", { ascending: false })
          .limit(200)
          .then((r) => {
            if (r.error) throw r.error;
            return (r.data ?? []) as unknown as Array<
              LinkRow & {
                target_url: string;
                products: { title: string } | null;
              }
            >;
          }),
        fetchAllRows<ClickRow>(
          (from, to) =>
            client
              .from("link_clicks")
              .select("code")
              .gte("clicked_at", since)
              .range(from, to) as unknown as PromiseLike<{
              data: ClickRow[] | null;
              error: { message: string } | null;
            }>,
        ),
        fetchAllRows<EnquiryRow>(
          (from, to) =>
            client
              .from("deals")
              .select("campaign, amount")
              .not("campaign", "is", null)
              .gte("created_at", since)
              .range(from, to) as unknown as PromiseLike<{
              data: EnquiryRow[] | null;
              error: { message: string } | null;
            }>,
        ),
      ]);
      return { links, clicks, enquiries };
    },
  });

  const report = data
    ? summariseLinks(data.links, data.clicks, data.enquiries)
    : null;

  return (
    <div className="mt-2 flex flex-col gap-6 px-4 md:px-0">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Link2 className="size-6 text-muted-foreground" /> Tracked links
      </h1>

      <NewLink baseUrl={baseUrl} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Last 30 days</h2>
        {isPending && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            The report could not be loaded.
          </p>
        )}
        {report && (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure
                label="Clicks"
                value={report.totals.clicks.toLocaleString("en-GB")}
              />
              <Figure
                label="Enquiries from campaigns"
                value={report.totals.enquiries.toLocaleString("en-GB")}
              />
              <Figure
                label="Value of those enquiries"
                value={`£${report.totals.value.toLocaleString("en-GB")}`}
              />
            </dl>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tracked links yet. Create one above.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Campaign</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Clicks
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Enquiries
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Value
                      </th>
                      <th className="px-3 py-2 font-medium">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.rows.map((row, index) => {
                      const link = data?.links[index];
                      return (
                        <tr key={row.code}>
                          <td className="px-3 py-2">{row.campaign}</td>
                          <td className="px-3 py-2">
                            {link?.products?.title ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.clicks}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.enquiries}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            £{row.value.toLocaleString("en-GB")}
                          </td>
                          <td className="px-3 py-2">
                            <CopyLink url={trackedLinkUrl(baseUrl, row.code)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-xl font-semibold tabular-nums">{value}</dd>
  </div>
);

const CopyLink = ({ url }: { url: string }) => {
  const notify = useNotify();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          notify("Link copied");
        } catch {
          notify("Could not copy. Select the link and copy it by hand.", {
            type: "warning",
          });
        }
      }}
    >
      <Copy /> Copy
    </Button>
  );
};

const NewLink = ({ baseUrl }: { baseUrl: string }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const [productId, setProductId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products_for_links"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("id, title, source_url")
        .eq("active", true)
        .like("source_url", "https://%")
        .order("title")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const campaignOk = CAMPAIGN.test(campaign);
  const save = async () => {
    const product = products.find((p) => String(p.id) === productId);
    if (!product?.source_url || !campaignOk) return;
    setSaving(true);
    const code = newCode();
    const { error } = await getSupabaseClient()
      .from("tracked_links")
      .insert({
        code,
        target_url: product.source_url,
        product_id: product.id,
        utm_campaign: campaign,
        created_by: Number(identity?.id) || null,
      });
    setSaving(false);
    if (error) {
      notify("The link could not be created. Try a different campaign name.", {
        type: "error",
      });
      return;
    }
    setCreated(trackedLinkUrl(baseUrl, code));
    setCampaign("");
    void queryClient.invalidateQueries({ queryKey: ["tracked_links_report"] });
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-base font-semibold">New tracked link</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="link-product">Product</Label>
          <select
            id="link-product"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Choose a listing</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="link-campaign">Campaign name</Label>
          <Input
            id="link-campaign"
            value={campaign}
            placeholder="e.g. post-autumn-harlow"
            onChange={(e) => setCampaign(e.target.value.toLowerCase())}
          />
          {campaign && !campaignOk && (
            <p className="text-xs text-destructive">
              Use lower-case letters, numbers and hyphens, up to 60 characters.
            </p>
          )}
        </div>
        <div className="flex items-end">
          <Button onClick={save} disabled={!productId || !campaignOk || saving}>
            <Plus /> {saving ? "Creating…" : "Create link"}
          </Button>
        </div>
      </div>
      {created && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {created}
          </code>
          <CopyLink url={created} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Put the link in a post. Each click is counted, and an enquiry from the
        website that came through it is credited to the campaign.
      </p>
    </section>
  );
};
