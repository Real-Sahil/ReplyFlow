// Checks a new business sign-up before anything is created. Pure, so the rules are unit
// tested and the endpoint stays a thin wrapper.

export type Onboarding = {
  organisationName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type OnboardingResult =
  | { ok: true; value: Onboarding }
  | { ok: false; reason: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 10;

const text = (input: unknown, max: number) =>
  typeof input === "string" ? input.trim().slice(0, max) : "";

export const parseOnboarding = (input: unknown): OnboardingResult => {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Send the sign-up form again." };
  }
  const body = input as Record<string, unknown>;

  const organisationName = text(body.organisation_name, 80);
  if (organisationName.length < 2) {
    return { ok: false, reason: "Add the name of your business." };
  }

  const firstName = text(body.first_name, 60);
  const lastName = text(body.last_name, 60);
  if (!firstName || !lastName) {
    return { ok: false, reason: "Add your first and last name." };
  }

  const email = text(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) {
    return { ok: false, reason: "That email address does not look right." };
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    value: { organisationName, firstName, lastName, email, password },
  };
};
