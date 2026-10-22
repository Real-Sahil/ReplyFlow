// Renders the customer's order page. Pure string building, so it can be unit tested and
// has no Deno-only APIs. Everything from the database is escaped before it reaches the page.

export const STAGES = [
  "confirmed",
  "deposit_paid",
  "in_production",
  "ready_for_delivery",
  "delivery_booked",
  "delivered",
  "completed",
] as const;

const STAGE_LABELS: Record<string, string> = {
  confirmed: "Order confirmed",
  deposit_paid: "Deposit paid",
  in_production: "In production",
  ready_for_delivery: "Ready for delivery",
  delivery_booked: "Delivery booked",
  delivered: "Delivered",
  completed: "Completed",
};

// The words travel with the colour, so the page still reads without colour.
const LIGHTS: Record<string, { word: string; tone: string }> = {
  green: { word: "On track", tone: "green" },
  amber: { word: "Needs attention", tone: "amber" },
  red: { word: "Delayed", tone: "red" },
};

export type TrackingOrder = {
  reference: string;
  product_summary: string | null;
  status: string;
  stage_lights: Record<string, string> | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  next_update_due: string | null;
  customer_update: string | null;
};

export const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Dates are stored as days, so they are read as London calendar days.
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
:root { --bg: #F7F6F3; --surface: #FFFFFF; --fg: #1B1A17; --muted: #5E5A52; --line: #E2DED6;
  --green: #1E6B3A; --amber: #8A5A00; --red: #9B1C1C; --todo: #B9B3A7; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #161513; --surface: #1F1E1B; --fg: #F2EFE9; --muted: #A8A397;
    --line: #37342E; --green: #8FD1A3; --amber: #E7C27A; --red: #F0A3A3; --todo: #5E5A52; color-scheme: dark; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 640px; margin: 0 auto; padding-block: 32px 48px; display: flex; flex-direction: column; gap: 20px; }
h1 { font-size: 24px; margin: 0; text-wrap: balance; }
h2 { font-size: 16px; margin: 0 0 8px; }
p { margin: 0; }
.muted { color: var(--muted); font-size: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.update { white-space: pre-line; overflow-wrap: anywhere; }
ol { list-style: none; margin: 0; padding: 0; }
li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
li:first-child { border-top: 0; }
.dot { width: 14px; height: 14px; border-radius: 50%; margin-top: 4px; background: var(--todo); }
.green .dot { background: var(--green); } .amber .dot { background: var(--amber); } .red .dot { background: var(--red); }
.stage { font-weight: 600; }
.current .stage { text-decoration: underline; text-underline-offset: 4px; }
.todo .stage { color: var(--muted); font-weight: 400; }
.light { font-size: 13px; color: var(--muted); }
footer { color: var(--muted); font-size: 13px; text-align: center; }
</style>
</head>
<body>
<main>
${body}
<footer>Mere &amp; Row</footer>
</main>
</body>
</html>
`;

export const renderNotFound = () =>
  shell(
    "Order not found · Mere & Row",
    `<div class="card"><h1>We could not find that order</h1>
<p class="muted">Check the link in your message, or ask us to send it again.</p></div>`,
  );

export const renderTrackingPage = (order: TrackingOrder) => {
  const title = `Your order ${order.reference} · Mere & Row`;
  const header = `<div class="card"><p class="muted">Order ${esc(order.reference)}</p>
<h1>${esc(order.product_summary || "Your order")}</h1></div>`;

  if (order.status === "cancelled") {
    return shell(
      title,
      `${header}<div class="card"><p>This order has been cancelled. If you did not ask for this, please get in touch with us.</p></div>`,
    );
  }
  if (order.status === "quoted") {
    return shell(
      title,
      `${header}<div class="card"><p>Your order will appear here once it has been confirmed.</p></div>`,
    );
  }

  const current = STAGES.indexOf(order.status as (typeof STAGES)[number]);
  const lights = order.stage_lights ?? {};
  const rows = STAGES.map((stage, index) => {
    const state =
      index < current ? "done" : index === current ? "current" : "todo";
    const light = state === "todo" ? null : LIGHTS[lights[stage] ?? ""];
    const status = light
      ? `<span class="light">${esc(light.word)}</span>`
      : state === "todo"
        ? `<span class="light">Not started</span>`
        : `<span class="light">Under way</span>`;
    const tone = light ? light.tone : "";
    return `<li class="${state} ${tone}"><span class="dot" aria-hidden="true"></span>
<div><span class="stage">${esc(STAGE_LABELS[stage])}</span>${state === "current" ? ' <span class="light">· now</span>' : ""}<br>${status}</div></li>`;
  }).join("\n");

  const timing: string[] = [];
  if (order.delivery_window_start && order.delivery_window_end) {
    timing.push(
      `Delivery between ${day(order.delivery_window_start)} and ${day(order.delivery_window_end)}.`,
    );
  } else if (order.delivery_window_end) {
    timing.push(`Delivery by ${day(order.delivery_window_end)}.`);
  }
  if (order.next_update_due) {
    timing.push(`Your next update is due by ${day(order.next_update_due)}.`);
  }

  const update = order.customer_update?.trim()
    ? `<div class="card"><h2>Latest update from Mere &amp; Row</h2><p class="update">${esc(order.customer_update.trim())}</p></div>`
    : "";

  return shell(
    title,
    `${header}
${update}
<div class="card"><h2>Progress</h2><ol>
${rows}
</ol></div>
${timing.length ? `<div class="card">${timing.map((line) => `<p>${esc(line)}</p>`).join("\n")}</div>` : ""}`,
  );
};
