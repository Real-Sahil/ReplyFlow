// The wording of the notification, kept apart so it can be tested.

const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

export const claimsMessage = ({
  name,
  count,
  totalPence,
  flagged,
}: {
  name: string;
  count: number;
  totalPence: number;
  flagged: number;
}): { title: string; body: string } => {
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
