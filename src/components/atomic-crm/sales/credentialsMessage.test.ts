import { describe, expect, it } from "vitest";

import { credentialsMessage } from "./credentialsMessage";

describe("credentialsMessage", () => {
  it("has everything the person needs and says the password is one-time", () => {
    const message = credentialsMessage({
      name: "Sam",
      business: "Mere & Row",
      url: "https://replyflow.example",
      email: "sam@example.com",
      password: "abcd-efgh-jkmn",
    });
    expect(message).toContain("Hi Sam");
    expect(message).toContain("https://replyflow.example");
    expect(message).toContain("sam@example.com");
    expect(message).toContain("abcd-efgh-jkmn");
    expect(message).toMatch(/choose your own password/);
  });
});
