// Checks a request to set up a new business before anything is created. Pure, so the rules are unit tested and
// the endpoint stays a thin wrapper. Unlike a public sign-up there is no password here: the platform owner hands
// over a one-time password that the new administrator must change at first sign-in.

export type NewBusiness = {
  organisationName: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type NewBusinessResult =
  | { ok: true; value: NewBusiness }
  | { ok: false; reason: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (input: unknown, max: number) =>
  typeof input === "string"
    ? input.trim().replace(/\s+/g, " ").slice(0, max)
    : "";

export const parseNewBusiness = (input: unknown): NewBusinessResult => {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Send the form again." };
  }
  const body = input as Record<string, unknown>;
  const organisationName = text(body.organisation_name, 80);
  if (organisationName.length < 2) {
    return { ok: false, reason: "Add the name of the business." };
  }
  const firstName = text(body.first_name, 60);
  const lastName = text(body.last_name, 60);
  if (!firstName || !lastName) {
    return {
      ok: false,
      reason: "Add the administrator's first and last name.",
    };
  }
  const email = text(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) {
    return { ok: false, reason: "That email address does not look right." };
  }
  return { ok: true, value: { organisationName, firstName, lastName, email } };
};

// A password someone can read out or paste into a message: 12 characters in three groups, without the letters
// and digits that look alike. Takes the random bytes so a test can supply them.
export const passwordFrom = (bytes: Uint8Array): string => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = Array.from(
    bytes.slice(0, 12),
    (b) => alphabet[b % alphabet.length],
  );
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((g) => g.join(""))
    .join("-");
};
