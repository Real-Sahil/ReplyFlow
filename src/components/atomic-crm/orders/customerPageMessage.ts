// The Messenger text that carries an order's page. Kept separate so the wording and the
// length limit can be tested on their own.

export const MESSENGER_TEXT_LIMIT = 2000;

// The address of an order's customer page. The base is the project's function address.
export const trackingLink = (baseUrl: string, token: string) =>
  `${baseUrl}/functions/v1/order_tracking?token=${encodeURIComponent(token)}`;

export const orderPageMessage = ({
  firstName,
  reference,
  link,
}: {
  firstName: string | null | undefined;
  reference: string;
  link: string;
}) => {
  const name = firstName?.trim() || "there";
  return [
    `Hi ${name}, here is the page for your order ${reference}, where you can see each stage and our latest update:`,
    link,
    "Reply here if you have any questions. Mere & Row",
  ].join("\n\n");
};
