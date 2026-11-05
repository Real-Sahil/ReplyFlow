// Records the app, one clip per scene, on a phone-sized screen, using fictional demo data.
// Usage: node record.cjs <output folder> [base url of a demo build]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { iso, tables } = require("./fixtures.cjs");

const OUT = path.resolve(process.argv[2] || "clips");
const BASE = process.argv[3] || "http://localhost:4188/";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
};
const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

// A tap shows as a soft ring, so a viewer can follow what is being pressed.
const RIPPLE = `
addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '@keyframes tap{from{transform:translate(-50%,-50%) scale(.3);opacity:.55}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}';
  document.head.appendChild(style);
  addEventListener('pointerdown', (e) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:64px;height:64px;border-radius:50%;background:rgba(190,60,45,.45);border:2px solid rgba(190,60,45,.8);left:'+e.clientX+'px;top:'+e.clientY+'px;animation:tap .6s ease-out forwards';
    document.body.appendChild(d); setTimeout(() => d.remove(), 700);
  }, true);
});`;

const state = { claims: JSON.parse(JSON.stringify(tables.expense_claims)) };

async function mock(ctx) {
  await ctx.route("https://demo.example.org/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const parts = url.pathname.split("/");
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = parts[4];
      const body = req.postDataJSON?.() ?? {};
      if (name === "decide_expense_claim") {
        const c = state.claims.find((x) => x.id === body.p_id);
        if (c) { c.status = body.p_approve ? "approved" : "rejected"; c.decision_note = body.p_note ?? null; }
        return json(route, c ?? {});
      }
      if (name === "my_organisation_id") return json(route, 1);
      return json(route, null);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = parts[3];
      if (req.method() !== "GET" && req.method() !== "HEAD") return json(route, [], 201);
      const rows = table === "expense_claims" ? state.claims : tables[table] ?? [];
      const wantsObject = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return wantsObject ? json(route, rows[0] ?? null, rows[0] ? 200 : 406) : json(route, rows);
    }
    if (url.pathname.startsWith("/auth/")) return json(route, { message: "no session" }, 401);
    return route.fulfill({ status: 404, headers: CORS, body: "" });
  });
}

async function scene(name, startRoute, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    recordVideo: { dir: path.join(OUT, `_${name}`), size: { width: 780, height: 1688 } },
  });
  await mock(ctx);
  await ctx.addInitScript(RIPPLE);
  await ctx.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch (_) {} });
  const page = await ctx.newPage();
  const t0 = Date.now();
  // Open straight on the scene's screen, and note when it is on show so the opening seconds
  // (the browser starting, the app loading) can be cut off.
  await page.goto(BASE + "#" + startRoute, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 15000 });
  await sleep(1500);
  const trim = Math.max(0, (Date.now() - t0) / 1000 - 0.6);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ trim }));
  await fn(page);
  const video = page.video();
  await ctx.close();
  const file = await video.path();
  fs.renameSync(file, path.join(OUT, `${name}.webm`));
  fs.rmSync(path.join(OUT, `_${name}`), { recursive: true, force: true });
  await browser.close();
  console.log("recorded", name);
}

const go = async (page, route, wait = 2200) => { await page.evaluate((h) => { location.hash = h; }, "#" + route); await sleep(wait); };
const scrollTo = async (page, top, ms = 1800) => {
  await page.evaluate((t) => { const el = document.querySelector("main.scroll-area") || document.scrollingElement; el.scrollTo({ top: t, behavior: "smooth" }); }, top);
  await sleep(ms);
};

(async () => {
  await scene("01-money-book", "/money", async (p) => {
    await go(p, "/money", 3000);
    await scrollTo(p, 420, 2200);
    await scrollTo(p, 0, 1500);
  });

  await scene("02-send-a-sheet", "/money", async (p) => {
    await go(p, "/money", 2500);
    const csv = path.join(OUT, "money-sheet.csv");
    const f = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-GB");
    fs.writeFileSync(csv, ["Date,Type,Amount,Who,How paid,Note",
      `${f(0)},Stock and materials bought,214.80,Wickham Wax Supplies,Bank transfer,Soy wax top-up`,
      `${f(0)},Delivery and courier,36.40,Brightline Couriers,Card,Parcels to the Barn`,
      `${f(-1)},Sales taken outside invoices,122.00,Craft fair stall,Cash,Saturday takings`,
      `${f(-3)},Rent and utilities,850.00,Marlow Estates,Bank transfer,Unit 4 rent`].join("\n"));
    await p.getByRole("button", { name: /Send a sheet/ }).click();
    await sleep(1800);
    await p.locator("input[type=file]").setInputFiles(csv);
    await sleep(3200);
    await p.evaluate(() => document.querySelector('[role=dialog]')?.scrollTo({ top: 260, behavior: "smooth" }));
    await sleep(2800);
    await p.evaluate(() => document.querySelector('[role=dialog]')?.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(1200);
    await p.getByRole("button", { name: /^Add 3 rows/ }).click();
    await sleep(2200);
  });

  await scene("03-bills", "/bills", async (p) => {
    await go(p, "/bills", 3200);
    await scrollTo(p, 380, 2400);
    await scrollTo(p, 0, 1200);
  });

  await scene("04-owed", "/owed", async (p) => {
    await go(p, "/owed", 3200);
    await scrollTo(p, 300, 2400);
    await scrollTo(p, 0, 1000);
  });

  await scene("05-staff-expenses", "/claims", async (p) => {
    await go(p, "/claims", 3200);
    await scrollTo(p, 180, 1800);
    await p.getByRole("button", { name: /Approve anyway/ }).first().click();
    await sleep(2200);
    await scrollTo(p, 0, 1200);
  });

  await scene("06-weekly-summary", "/summary", async (p) => {
    await go(p, "/summary", 3400);
    await scrollTo(p, 360, 2200);
    await scrollTo(p, 0, 1200);
  });

  await scene("07-dark-mode", "/money", async (p) => {
    await go(p, "/money", 2600);
    await p.getByRole("button", { name: /Switch to dark mode/ }).first().click();
    await sleep(2400);
    await scrollTo(p, 360, 2200);
    await go(p, "/owed", 2600);
    await go(p, "/claims", 2800);
  });
})().catch((e) => { console.error(e); process.exit(1); });
