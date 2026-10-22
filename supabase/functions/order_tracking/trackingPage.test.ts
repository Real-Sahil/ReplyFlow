import { describe, expect, it } from "vitest";
import {
  esc,
  renderNotFound,
  renderTrackingPage,
  type TrackingOrder,
} from "./trackingPage.ts";

const base: TrackingOrder = {
  reference: "MR-1042",
  product_summary: "Harlow 3-seater",
  status: "in_production",
  stage_lights: {
    confirmed: "green",
    deposit_paid: "green",
    in_production: "amber",
  },
  delivery_window_start: "2026-11-20",
  delivery_window_end: "2026-11-27",
  next_update_due: "2026-11-05",
  customer_update: "Frame is cut. Upholstery starts Monday.",
};

describe("renderTrackingPage", () => {
  it("marks passed stages done, the current stage now, and the rest not started", () => {
    const html = renderTrackingPage(base);
    expect(html.match(/class="done/g)?.length).toBe(2);
    expect(html.match(/class="current/g)?.length).toBe(1);
    expect(html.match(/class="todo/g)?.length).toBe(4);
    expect(html).toContain("Not started");
  });

  it("shows each light with its word, not colour alone", () => {
    const html = renderTrackingPage(base);
    expect(html).toContain("On track");
    expect(html).toContain("Needs attention");
  });

  it("says the current stage is under way when no light has been set", () => {
    const html = renderTrackingPage({ ...base, stage_lights: {} });
    expect(html).toContain("Under way");
  });

  it("escapes anything written by staff", () => {
    const html = renderTrackingPage({
      ...base,
      customer_update: '<script>alert("x")</script>',
      product_summary: "Sofa & <b>chair</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Sofa &amp; &lt;b&gt;chair&lt;/b&gt;");
  });

  it("says plainly when an order is not yet confirmed or has been cancelled", () => {
    expect(renderTrackingPage({ ...base, status: "quoted" })).toContain(
      "once it has been confirmed",
    );
    expect(renderTrackingPage({ ...base, status: "cancelled" })).toContain(
      "has been cancelled",
    );
  });

  it("shows the delivery window and the next update date in London time", () => {
    const html = renderTrackingPage(base);
    expect(html).toContain("Delivery between");
    expect(html).toContain("Your next update is due by");
  });

  it("is not indexed by search engines", () => {
    expect(renderTrackingPage(base)).toContain('content="noindex, nofollow"');
  });
});

describe("esc and renderNotFound", () => {
  it("escapes the five characters that matter", () => {
    expect(esc(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("gives a page that does not reveal whether a token exists", () => {
    expect(renderNotFound()).toContain("We could not find that order");
  });
});
