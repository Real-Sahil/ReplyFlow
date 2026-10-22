import { describe, expect, it } from "vitest";
import { mapLeadFields, parseLeadgenEvents } from "./leadgenRules.ts";

describe("parseLeadgenEvents", () => {
  it("reads each new lead from a webhook delivery", () => {
    const events = parseLeadgenEvents({
      object: "page",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "9001",
                page_id: "123",
                form_id: "55",
                ad_id: "77",
              },
            },
            { field: "feed", value: { item: "status" } },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { leadgenId: "9001", pageId: "123", formId: "55", adId: "77" },
    ]);
  });

  it("ignores deliveries with no leads", () => {
    expect(
      parseLeadgenEvents({
        entry: [{ changes: [{ field: "feed", value: {} }] }],
      }),
    ).toEqual([]);
    expect(parseLeadgenEvents({})).toEqual([]);
    expect(parseLeadgenEvents(null)).toEqual([]);
  });
});

describe("mapLeadFields", () => {
  it("maps the standard questions and keeps the rest in the message", () => {
    const fields = mapLeadFields(
      [
        { name: "full_name", values: ["Amy Hobbs"] },
        { name: "email", values: ["amy@example.com"] },
        { name: "phone_number", values: ["+44 7700 900123"] },
        { name: "which_room_is_it_for", values: ["Lounge"] },
      ],
      "Autumn sofas",
    );
    expect(fields).toEqual({
      name: "Amy Hobbs",
      email: "amy@example.com",
      phone: "+44 7700 900123",
      message: "which room is it for: Lounge",
      product: "Autumn sofas",
    });
  });

  it("joins first and last name when there is no full name", () => {
    const fields = mapLeadFields(
      [
        { name: "first_name", values: ["Sam"] },
        { name: "last_name", values: ["Reed"] },
      ],
      null,
    );
    expect(fields.name).toBe("Sam Reed");
    expect(fields.product).toBe("Facebook lead ad");
    expect(fields.email).toBeNull();
  });

  it("falls back to a placeholder name and drops empty answers", () => {
    const fields = mapLeadFields([{ name: "email", values: ["  "] }], null);
    expect(fields.name).toBe("Facebook lead");
    expect(fields.email).toBeNull();
    expect(fields.message).toBeNull();
  });
});
