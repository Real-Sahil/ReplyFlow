// A demo of the app for promotional recordings, with a small fictional candle maker's data in place of the
// generated sample data. Only used by vite.promo.config.ts; nothing here ships in the app.
import { createRoot } from "react-dom/client";
import { memoryStore } from "ra-core";
import "../src/index.css";
import { CRM } from "@/components/atomic-crm/root/CRM";
import { createDataProvider } from "@/components/atomic-crm/providers/fakerest/dataProvider";
import generateData from "@/components/atomic-crm/providers/fakerest/dataGenerator";
import { authProvider } from "@/components/atomic-crm/providers/fakerest/authProvider";

const db: any = generateData();
const now = Date.now();
const hours = (h: number) => new Date(now - h * 3600_000).toISOString();
const days = (d: number) => new Date(now + d * 86400_000).toISOString();

db.products = [
  ["Lavender & Cedar soy candle, 220g", "Soy candles", "Purple", 1800, null],
  ["Winter Spice soy candle, 220g", "Soy candles", "Amber", 1800, null],
  ["Beeswax taper pair, 25cm", "Tapers", "Natural", 1200, null],
  ["Wedding favour tin, 50g", "Favours", "Cream", 450, null],
  ["Reed diffuser, Fig & Black Tea", "Diffusers", "Green", 2400, 2800],
  ["Wax melt box, six pack", "Melts", "Mixed", 900, null],
  ["Oat & Honey pillar candle", "Pillars", "Honey", 1600, null],
  ["Gift set, three tins", "Gifts", "Mixed", 2100, 2500],
].map(([title, collection, colour, price, was], i) => ({
  id: i + 1,
  reference: `HH-S00${i + 1}`,
  title,
  collection,
  colour,
  price_pence: price,
  original_price_pence: was,
  image_url: null,
  active: true,
}));

db.orders = [
  ["Wedding favours, 60 tins", "quoted", 27000, 27000],
  ["Café shelf, 12 Lavender & Cedar", "confirmed", 21600, 21600],
  ["Gift set x4, Alder Gift Shop", "deposit_paid", 8400, 4200],
  ["Winter Spice x6", "in_production", 10800, 5400],
  ["Reed diffusers x8", "delivery_booked", 19200, 9600],
  ["Taper pairs x10", "delivered", 12000, 0],
].map(([product_summary, status, agreed, balance], i) => ({
  id: i + 1,
  reference: `HH-104${i + 1}`,
  contact_id: db.contacts[i].id,
  product_summary,
  status,
  agreed_price_pence: agreed,
  balance_pence: balance,
  next_update_due: days(3 + i).slice(0, 10),
}));

const people = [
  ["Amelia", "Hart", "Do you do the lavender and cedar in the 220g size?", 1],
  ["Ben", "Okoro", "Could I get 60 favour tins by 14 November?", 2],
  ["Priya", "Shah", "Thanks, the parcel arrived this morning!", 4],
  ["Tom", "Hardy", "Is the wax melt box still on offer?", 7],
  ["Chloe", "Marsh", "Do you do a trade price for the gift shop?", 26],
  ["Dev", "Patel", "What time does your craft fair stall open?", 30],
] as const;
db.messenger_inbox = people.map(([first_name, last_name, last_body, h], i) => ({
  id: i + 1,
  contact_id: i + 1,
  first_name,
  last_name,
  last_body,
  last_direction: i === 2 ? "outbound" : "inbound",
  last_sent_at: hours(h),
  window_open: i < 4,
  unread: i === 0 || i === 1 || i === 3,
}));
db.messenger_messages = [
  [1, "inbound", "Hi! Do you do the lavender and cedar in the 220g size?", 2.2],
  [
    1,
    "outbound",
    "Hi Amelia, yes we do. It's £18 and I can pour more this week.",
    2,
  ],
  [
    1,
    "inbound",
    "Lovely. Could I have twelve for the café shelf? Same price?",
    1,
  ],
].map(([contact_id, direction, body, h], i) => ({
  id: i + 1,
  contact_id,
  direction,
  body,
  sent_at: hours(h as number),
}));
db.saved_replies = [
  {
    id: 1,
    title: "Greeting",
    body: "Hi {{first_name}}, thanks for getting in touch.",
  },
  {
    id: 2,
    title: "Delivery times",
    body: "We post within three working days. Tracking comes by message.",
  },
  {
    id: 3,
    title: "Trade prices",
    body: "Yes, we do trade prices from ten pieces. I will send them over.",
  },
];
db.messenger_settings = [{ id: 1 }];
db.messenger_conversation_state = [];
db.page_comments = [
  {
    id: 1,
    post_id: "1_1",
    author_name: "Priya Shah",
    body: "Is the Winter Spice back for Christmas?",
    commented_at: hours(2),
    status: "new",
    parent_id: null,
  },
  {
    id: 2,
    post_id: "1_1",
    author_name: "Tom Hardy",
    body: "Gorgeous. Do you ship to Wales?",
    commented_at: hours(30),
    status: "replied",
    reply_text: "We do. Sending you a message now.",
    parent_id: null,
    private_reply_at: hours(29),
  },
];
db.page_posts = [
  {
    id: 1,
    message: "Winter Spice is back.\nSoy wax, poured by hand in small batches.",
    status: "scheduled",
    scheduled_for: days(1),
    fb_post_id: "1_2",
    image_url: null,
  },
  {
    id: 2,
    message: "Christmas orders for favours close on 1 December.",
    status: "approved",
    scheduled_for: days(3),
    image_url: null,
  },
  {
    id: 3,
    message: "Craft fair this Saturday, stall 14.",
    status: "published",
    published_at: hours(72),
    fb_post_id: "1_3",
    image_url: null,
  },
  {
    id: 4,
    message: "Gift sets are in, three tins in a box.",
    status: "draft",
    image_url: null,
  },
];

const dataProvider = createDataProvider({
  db,
  latency: 0,
  silent: true,
  authProvider,
});
createRoot(document.getElementById("root")!).render(
  <CRM
    dataProvider={dataProvider}
    authProvider={authProvider}
    store={memoryStore()}
    title="Hollow Hill"
  />,
);
