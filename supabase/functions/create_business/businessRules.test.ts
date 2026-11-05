import { describe, expect, it } from "vitest";

import { parseNewBusiness, passwordFrom } from "./businessRules.ts";

const good = {
  organisation_name: "  Hollow   Hill Candles ",
  first_name: "Amelia",
  last_name: "Hart",
  email: " Amelia@Example.com ",
};

describe("parseNewBusiness", () => {
  it("tidies the names and lowercases the email", () => {
    expect(parseNewBusiness(good)).toEqual({
      ok: true,
      value: {
        organisationName: "Hollow Hill Candles",
        firstName: "Amelia",
        lastName: "Hart",
        email: "amelia@example.com",
      },
    });
  });
  it("needs a business name, both names and a real-looking email", () => {
    expect(parseNewBusiness({ ...good, organisation_name: "A" }).ok).toBe(
      false,
    );
    expect(parseNewBusiness({ ...good, last_name: "" }).ok).toBe(false);
    expect(parseNewBusiness({ ...good, email: "not-an-email" }).ok).toBe(false);
    expect(parseNewBusiness(null).ok).toBe(false);
  });
  it("does not accept a password from the sender", () => {
    const parsed = parseNewBusiness({ ...good, password: "hunter2hunter2" });
    expect(parsed.ok && "password" in parsed.value).toBe(false);
  });
});

describe("passwordFrom", () => {
  it("makes three groups of four from letters and digits that do not look alike", () => {
    const password = passwordFrom(new Uint8Array(12).map((_, i) => i * 7));
    expect(password).toMatch(
      /^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/,
    );
  });
});
