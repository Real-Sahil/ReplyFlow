// Turns click and enquiry rows into the figures on the Tracked links page. Kept pure so the
// counting can be tested without the database.

export type LinkRow = { code: string; utm_campaign: string };
export type ClickRow = { code: string };
export type EnquiryRow = { campaign: string | null; amount: number | null };

export const trackedLinkUrl = (baseUrl: string, code: string) =>
  `${baseUrl}/functions/v1/go?c=${encodeURIComponent(code)}`;

export const summariseLinks = (
  links: LinkRow[],
  clicks: ClickRow[],
  enquiries: EnquiryRow[],
) => {
  const clicksByCode = new Map<string, number>();
  for (const click of clicks) {
    clicksByCode.set(click.code, (clicksByCode.get(click.code) ?? 0) + 1);
  }
  const byCampaign = new Map<string, { count: number; value: number }>();
  for (const enquiry of enquiries) {
    if (!enquiry.campaign) continue;
    const entry = byCampaign.get(enquiry.campaign) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number(enquiry.amount ?? 0);
    byCampaign.set(enquiry.campaign, entry);
  }
  const rows = links.map((link) => ({
    code: link.code,
    campaign: link.utm_campaign,
    clicks: clicksByCode.get(link.code) ?? 0,
    enquiries: byCampaign.get(link.utm_campaign)?.count ?? 0,
    value: byCampaign.get(link.utm_campaign)?.value ?? 0,
  }));
  const totals = {
    clicks: clicks.length,
    enquiries: enquiries.filter((e) => e.campaign).length,
    value: enquiries.reduce(
      (sum, e) => (e.campaign ? sum + Number(e.amount ?? 0) : sum),
      0,
    ),
  };
  return { rows, totals };
};
