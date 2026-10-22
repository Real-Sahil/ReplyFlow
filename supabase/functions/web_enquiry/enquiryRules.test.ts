import { describe, expect, it } from "vitest";

import { parseEnquiry } from "./enquiryRules";

const valid = {
  name: "Casey Customer",
  email: "Casey@Example.com",
  phone: "",
  message: "Do you deliver to Reading?",
  product: "Marilyn 3+2 Sofa Set",
  source_url: "https://mereandrow.com/products/marilyn",
  consent: true,
};

describe("parseEnquiry", () => {
  it("accepts a complete enquiry and normalises the email", () => {
    const result = parseEnquiry(valid);
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Casey Customer",
        email: "casey@example.com",
        phone: "",
        message: "Do you deliver to Reading?",
        product: "Marilyn 3+2 Sofa Set",
        sourceUrl: "https://mereandrow.com/products/marilyn",
      },
    });
  });

  it("needs a way to reply: email or phone", () => {
    expect(parseEnquiry({ ...valid, email: "" }).ok).toBe(false);
    expect(
      parseEnquiry({ ...valid, email: "", phone: "07700 900123" }).ok,
    ).toBe(true);
  });

  it("rejects a malformed email or phone", () => {
    expect(parseEnquiry({ ...valid, email: "not-an-email" }).ok).toBe(false);
    expect(parseEnquiry({ ...valid, email: "", phone: "call me" }).ok).toBe(
      false,
    );
  });

  it("requires consent, a name and a real message", () => {
    expect(parseEnquiry({ ...valid, consent: false }).ok).toBe(false);
    expect(parseEnquiry({ ...valid, name: "A" }).ok).toBe(false);
    expect(parseEnquiry({ ...valid, message: "hi" }).ok).toBe(false);
  });

  it("refuses a page link that is not http or https", () => {
    expect(
      parseEnquiry({ ...valid, source_url: "javascript:alert(1)" }).ok,
    ).toBe(false);
  });

  it("refuses non-object bodies", () => {
    expect(parseEnquiry(null).ok).toBe(false);
    expect(parseEnquiry("hello").ok).toBe(false);
  });
});
