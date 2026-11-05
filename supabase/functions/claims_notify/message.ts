import { formatMoney, type MoneyFormat } from "../_shared/moneyFormat.ts";
// The wording of the notification, kept apart so it can be tested.

export const claimsMessage = ({
  name,
  count,
  totalPence,
  flagged,
  format,
}: {
  name: string;
  count: number;
  totalPence: number;
  flagged: number;
  format?: MoneyFormat;
}): { title: string; body: string } => {
  const pounds = (pence: number) => formatMoney(pence, format);
  const who = name || "Someone";
  const title =
    count === 1 ? "New expense claim" : `${count} new expense claims`;
  const body =
    count === 1
      ? `${who} sent a claim for ${pounds(totalPence)}.`
      : `${who} sent ${count} claims, ${pounds(totalPence)} in all.`;
  if (flagged <= 0) return { title, body };
  const note =
    flagged === 1
      ? " One may be a duplicate."
      : ` ${flagged} may be duplicates.`;
  return { title, body: `${body}${note}` };
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const trimNumber = (n: number) => String(Number(n.toFixed(2)));

export const hoursMessage = ({
  name,
  count,
  hours,
}: {
  name: string;
  count: number;
  hours: number;
}): { title: string; body: string } => {
  const who = name || "Someone";
  const h = `${trimNumber(hours)} ${plural(hours, "hour", "hours")}`;
  return {
    title:
      count === 1 ? "Hours to approve" : `${count} hours entries to approve`,
    body:
      count === 1
        ? `${who} recorded ${h}.`
        : `${who} recorded ${count} entries, ${h} in all.`,
  };
};

export const holidayMessage = ({
  name,
  count,
  days,
}: {
  name: string;
  count: number;
  days: number;
}): { title: string; body: string } => {
  const who = name || "Someone";
  const d = `${trimNumber(days)} ${plural(days, "day", "days")}`;
  return {
    title: count === 1 ? "Holiday request" : `${count} holiday requests`,
    body:
      count === 1
        ? `${who} asked for ${d} of holiday.`
        : `${who} sent ${count} requests, ${d} in all.`,
  };
};
