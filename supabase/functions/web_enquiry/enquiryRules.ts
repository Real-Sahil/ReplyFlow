// Checks a public website enquiry before anything is stored. Pure, so the rules are
// unit tested with vitest and the endpoint stays a thin wrapper.

export type Enquiry = {
  name: string;
  email: string;
  phone: string;
  message: string;
  product: string;
  sourceUrl: string;
};

export type ParseResult =
  | { ok: true; value: Enquiry }
  | { ok: false; reason: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

const text = (input: unknown, max: number) =>
  typeof input === "string" ? input.trim().slice(0, max) : "";

export const parseEnquiry = (input: unknown): ParseResult => {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Send the enquiry form again." };
  }
  const body = input as Record<string, unknown>;

  const name = text(body.name, 80);
  if (name.length < 2) return { ok: false, reason: "Please add your name." };

  const email = text(body.email, 254).toLowerCase();
  const phone = text(body.phone, 20);
  if (email && !EMAIL.test(email)) {
    return { ok: false, reason: "That email address does not look right." };
  }
  if (phone && !PHONE.test(phone)) {
    return { ok: false, reason: "That phone number does not look right." };
  }
  if (!email && !phone) {
    return {
      ok: false,
      reason: "Add an email address or a phone number so we can reply.",
    };
  }

  const message = text(body.message, 1000);
  if (message.length < 5) {
    return { ok: false, reason: "Tell us a little more about what you need." };
  }

  const sourceUrl = text(body.source_url, 300);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, reason: "The page link is not valid." };
  }

  if (body.consent !== true) {
    return { ok: false, reason: "Tick the box so we can reply to you." };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      message,
      product: text(body.product, 120),
      sourceUrl,
    },
  };
};
