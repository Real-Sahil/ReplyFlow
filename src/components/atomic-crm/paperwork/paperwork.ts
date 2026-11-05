// Business paperwork with dates, and the equipment register. Pure helpers, so the rules can be tested.
// This keeps records and reminders. It does not give advice on what a business needs to hold.

import { daysToExpiry, expiryState, SOON_DAYS } from "../people/people";

export type DocCategory =
  | "insurance"
  | "licence"
  | "certificate"
  | "safety"
  | "vehicle"
  | "contract"
  | "other";

export type BusinessDocument = {
  id: number;
  title: string;
  category: DocCategory;
  asset_id: number | null;
  provider: string | null;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  note: string | null;
  file_path: string | null;
  active: boolean;
};

export type AssetKind = "vehicle" | "tool" | "equipment" | "it" | "other";

export type Asset = {
  id: number;
  name: string;
  kind: AssetKind;
  identifier: string | null;
  holder_person_id: number | null;
  purchase_date: string | null;
  cost_pence: number | null;
  last_service_date: string | null;
  next_service_date: string | null;
  service_every_months: number | null;
  notes: string | null;
  active: boolean;
};

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  insurance: "Insurance",
  licence: "Licence or permit",
  certificate: "Certificate",
  safety: "Safety check",
  vehicle: "Vehicle test or tax",
  contract: "Contract",
  other: "Other",
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  vehicle: "Vehicle",
  tool: "Tool",
  equipment: "Equipment",
  it: "Computer or phone",
  other: "Other",
};

// Current documents that have expired or run out within a month, soonest first.
export const docsNeedingAttention = (docs: BusinessDocument[], today: Date) =>
  docs
    .filter(
      (d) =>
        d.active &&
        ["expired", "soon"].includes(expiryState(d.expires_on, today)),
    )
    .sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""));

// Items in use whose service or test is overdue or due within a month, soonest first.
export const assetsNeedingAttention = (assets: Asset[], today: Date) =>
  assets
    .filter(
      (a) =>
        a.active &&
        ["expired", "soon"].includes(expiryState(a.next_service_date, today)),
    )
    .sort((a, b) =>
      (a.next_service_date ?? "").localeCompare(b.next_service_date ?? ""),
    );

export const dueLabel = (date: string | null, today: Date): string => {
  const d = daysToExpiry(date, today);
  if (d === null) return "No date set";
  if (d < 0)
    return d === -1 ? "Overdue since yesterday" : `Overdue by ${-d} days`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
};

// A date a number of months on, keeping the day where the month is long enough (31 Jan + 1 = 28 Feb).
export const addMonths = (iso: string, months: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

// Marking an item as serviced today: the date is recorded, and the next one follows from how often it
// is serviced (none if that is not set).
export const markServiced = (
  asset: Pick<Asset, "service_every_months">,
  today: string,
) => ({
  last_service_date: today,
  next_service_date: asset.service_every_months
    ? addMonths(today, asset.service_every_months)
    : null,
});

export const totalCost = (assets: Asset[]) =>
  assets
    .filter((a) => a.active)
    .reduce((sum, a) => sum + (a.cost_pence ?? 0), 0);

export { SOON_DAYS };
