import { describe, expect, it } from "vitest";

import {
  expiryLabel,
  expiryState,
  holidayRemaining,
  needingAttention,
  payLabel,
  workingDays,
  type Leave,
  type Person,
  type PersonDocument,
} from "./people";

const today = new Date(2026, 10, 4);

const leave = (
  id: number,
  from: string,
  days: number,
  extra: Partial<Leave> = {},
): Leave => ({
  id,
  person_id: 1,
  kind: "holiday",
  from_date: from,
  to_date: from,
  days,
  note: null,
  voided_at: null,
  ...extra,
});

describe("holidayRemaining", () => {
  const rows = [
    leave(1, "2026-03-10", 5),
    leave(2, "2026-08-01", 4.5),
    leave(3, "2026-05-01", 2, { kind: "sick" }),
    leave(4, "2026-06-01", 3, { voided_at: "2026-06-02T00:00:00Z" }),
    leave(5, "2025-12-29", 5),
  ];
  it("counts only holiday, not voided, in the year it starts", () => {
    expect(holidayRemaining(28, rows, 2026)).toBe(18.5);
    expect(holidayRemaining(28, rows, 2025)).toBe(23);
  });
});

describe("workingDays", () => {
  it("counts weekdays, both ends included", () => {
    expect(workingDays("2026-11-02", "2026-11-06")).toBe(5); // Mon to Fri
    expect(workingDays("2026-11-02", "2026-11-09")).toBe(6); // Mon to next Mon
    expect(workingDays("2026-11-07", "2026-11-08")).toBe(0); // a weekend
    expect(workingDays("2026-11-09", "2026-11-02")).toBe(0);
  });
});

describe("expiry", () => {
  it("states and wording", () => {
    expect(expiryState(null, today)).toBe("none");
    expect(expiryState("2026-12-10", today)).toBe("ok");
    expect(expiryState("2026-11-20", today)).toBe("soon");
    expect(expiryState("2026-11-03", today)).toBe("expired");
    expect(expiryLabel("2026-11-03", today)).toBe("Expired yesterday");
    expect(expiryLabel("2026-11-04", today)).toBe("Expires today");
    expect(expiryLabel("2026-11-19", today)).toBe("Expires in 15 days");
  });
});

describe("needingAttention", () => {
  const person = (id: number, active: boolean): Person => ({
    id,
    full_name: `P${id}`,
    kind: "employee",
    role_title: null,
    phone: null,
    email: null,
    start_date: null,
    end_date: null,
    pay_rate_pence: null,
    pay_basis: null,
    holiday_allowance_days: 28,
    notes: null,
    active,
  });
  const doc = (
    id: number,
    person_id: number,
    expires: string | null,
    active = true,
  ): PersonDocument => ({
    id,
    person_id,
    title: "Right to work",
    issued_on: null,
    expires_on: expires,
    note: null,
    file_path: null,
    active,
  });
  it("lists expired and soon-to-expire documents of current people, soonest first", () => {
    const out = needingAttention(
      [
        doc(1, 1, "2026-11-20"),
        doc(2, 1, "2026-10-01"),
        doc(3, 1, "2027-06-01"),
        doc(4, 2, "2026-11-10"), // person has left
        doc(5, 1, "2026-11-10", false), // no longer current
        doc(6, 1, null),
      ],
      [person(1, true), person(2, false)],
      today,
    );
    expect(out.map((d) => d.id)).toEqual([2, 1]);
  });
});

describe("payLabel", () => {
  it("shows the rate and its basis", () => {
    expect(payLabel({ pay_rate_pence: 1250, pay_basis: "hour" })).toBe(
      "£12.50 per hour",
    );
    expect(payLabel({ pay_rate_pence: null, pay_basis: null })).toBe(
      "Pay not recorded",
    );
  });
});
