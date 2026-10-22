// Messenger allows free-form replies for 24 hours after the customer's last message.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const isWithinReplyWindow = (
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
) => {
  if (!lastInboundAt) return false;
  const sent = Date.parse(lastInboundAt);
  if (Number.isNaN(sent)) return false;
  return now - sent >= 0 && now - sent <= REPLY_WINDOW_MS;
};

export const validateReplyText = (text: unknown): string | null => {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  // Messenger text messages are limited to 2000 characters.
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
};

export type ProductForMessage = {
  title: string;
  price_pence: number | null;
  original_price_pence: number | null;
  source_url: string | null;
};

const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);

// The text that goes with a product photo: name, price, and the website link.
export const formatProductMessage = (product: ProductForMessage) => {
  const lines = [product.title];
  if (product.price_pence != null) {
    const was =
      product.original_price_pence != null &&
      product.original_price_pence > product.price_pence
        ? ` (was ${pounds(product.original_price_pence)})`
        : "";
    lines.push(`${pounds(product.price_pence)}${was}`);
  }
  if (product.source_url) lines.push(product.source_url);
  return lines.join("\n").slice(0, 2000);
};
