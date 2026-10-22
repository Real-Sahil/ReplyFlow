// Pure helpers for Facebook lead ads: read the webhook payload and turn a lead's form
// answers into the fields the CRM stores. Kept free of Deno-only APIs so they can be
// unit tested with vitest.

export type LeadgenEvent = {
  leadgenId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
};

export type FieldData = { name: string; values: string[] };

export type LeadFields = {
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  product: string;
};

// Meta sends one delivery per Page with a change per new lead.
export const parseLeadgenEvents = (body: unknown): LeadgenEvent[] => {
  const events: LeadgenEvent[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return events;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = change as { field?: unknown; value?: Record<string, unknown> };
      if (c.field !== "leadgen" || !c.value) continue;
      const leadgenId = String(c.value.leadgen_id ?? "");
      if (!leadgenId) continue;
      events.push({
        leadgenId,
        pageId: String(c.value.page_id ?? ""),
        formId: c.value.form_id ? String(c.value.form_id) : null,
        adId: c.value.ad_id ? String(c.value.ad_id) : null,
      });
    }
  }
  return events;
};

const normalise = (label: string) => label.toLowerCase().replace(/[^a-z]/g, "");

const EMAIL_KEYS = ["email", "workemail", "emailaddress"];
const PHONE_KEYS = [
  "phonenumber",
  "phone",
  "mobile",
  "mobilephone",
  "telephone",
];
const NAME_KEYS = ["fullname", "name"];
const FIRST_KEYS = ["firstname"];
const LAST_KEYS = ["lastname", "surname"];

// Standard Meta questions are mapped to fixed fields. Any other question is kept in
// the message, labelled with the question's own name, so nothing the customer typed
// is lost.
export const mapLeadFields = (
  fieldData: FieldData[],
  campaignName: string | null,
): LeadFields => {
  const answers = new Map<string, string>();
  const extra: string[] = [];
  for (const field of fieldData) {
    const value = (field.values ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .join(", ");
    if (!value) continue;
    const key = normalise(field.name);
    if (EMAIL_KEYS.includes(key)) answers.set("email", value);
    else if (PHONE_KEYS.includes(key)) answers.set("phone", value);
    else if (NAME_KEYS.includes(key)) answers.set("name", value);
    else if (FIRST_KEYS.includes(key)) answers.set("first", value);
    else if (LAST_KEYS.includes(key)) answers.set("last", value);
    else extra.push(`${field.name.replace(/_/g, " ")}: ${value}`);
  }

  const name =
    answers.get("name") ??
    [answers.get("first"), answers.get("last")].filter(Boolean).join(" ");

  return {
    name: name || "Facebook lead",
    email: answers.get("email") ?? null,
    phone: answers.get("phone") ?? null,
    message: extra.length ? extra.join("\n") : null,
    product: campaignName?.trim() || "Facebook lead ad",
  };
};
