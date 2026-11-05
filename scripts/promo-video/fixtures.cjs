// Fictional demo data for the promo video: "Harbour & Hearth Candles", a made-up shop. Nothing here is
// a real customer, supplier or person. Dates are relative to today so the screens always read "this month".
const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};
const ts = (offset, h = 10) => `${iso(offset)}T${String(h).padStart(2, "0")}:15:00+00:00`;

const categories = [
  ["sales_other", "Sales taken outside invoices", "in", "Sales"],
  ["other_income", "Other income", "in", "Other money in"],
  ["rent", "Rent and utilities", "out", "Premises"],
  ["stock", "Stock and materials bought", "out", "Costs of sales"],
  ["delivery_out", "Delivery and courier", "out", "Costs of sales"],
  ["packaging_out", "Packaging", "out", "Costs of sales"],
  ["software_out", "Software and subscriptions", "out", "Overheads"],
  ["advertising_out", "Advertising and marketing", "out", "Overheads"],
  ["travel_out", "Travel and vehicle", "out", "Overheads"],
  ["office_out", "Office costs", "out", "Overheads"],
  ["other_out", "Other cost", "out", "Overheads"],
].map(([code, label, direction, grp]) => ({ code, label, direction, grp, regulated: false, admin_only: false }));

const entry = (id, direction, category, label, group, off, pence, who, method, note, extra = {}) => ({
  id, direction, category, category_label: label, category_group: group,
  status: extra.planned ? "planned" : "done", state: extra.planned ? "planned" : "done",
  entry_date: iso(off), period_from: null, period_to: null, amount_pence: pence,
  counterparty: who, payment_method: method, reference: null, channel: null,
  order_id: null, order_reference: null, order_summary: null, order_note: null,
  regulated: false, receipt_path: null, note, voided_at: null, void_reason: null, vat_code: "O", vat_pence: 0,
});

const money_ledger = [
  entry(11, "in", "sales_other", "Sales taken outside invoices", "Sales", 0, 12200, "Craft fair stall", "cash", "Saturday craft fair takings"),
  entry(10, "out", "delivery_out", "Delivery and courier", "Costs of sales", 0, 3640, "Brightline Couriers", "card", "Wedding favour parcels"),
  entry(9, "out", "software_out", "Software and subscriptions", "Overheads", -1, 1499, "Cobalt Software", "card", "Shop software, monthly"),
  entry(8, "in", "sales_other", "Sales taken outside invoices", "Sales", -1, 8650, "Market stall", "cash", "Sunday market takings"),
  entry(7, "out", "stock", "Stock and materials bought", "Costs of sales", -2, 21480, "Wickham Wax Supplies", "bank_transfer", "Soy wax and wicks, 25 kg"),
  entry(6, "out", "packaging_out", "Packaging", "Costs of sales", -2, 6290, "Northgate Packaging", "card", "Gift boxes, 200"),
  entry(5, "out", "advertising_out", "Advertising and marketing", "Overheads", -3, 4000, "Facebook ads", "card", "Autumn range promotion"),
  entry(4, "out", "rent", "Rent and utilities", "Premises", -3, 85000, "Marlow Estates", "bank_transfer", "Unit 4 rent, November"),
  entry(3, "in", "other_income", "Other income", "Other money in", -3, 5000, "Workshop booking", "bank_transfer", "Candle-making workshop deposit"),
  entry(2, "out", "rent", "Rent and utilities", "Premises", 24, 21000, "Business rates", null, "Rates instalment due", { planned: true }),
];

const bill = (id, off, supplier, ref, desc, cat, label, net, vat, paidOff, due) => ({
  id, bill_date: iso(off), due_date: iso(due), supplier_name: supplier, supplier_vat_number: null, reference: ref,
  category: cat, category_label: label, description: desc, note: null,
  order_id: null, order_reference: null, order_summary: null, order_note: null,
  vat_code: vat ? "S" : "O", net_pence: net, vat_pence: vat, gross_pence: net + vat, vat_reclaimable: true,
  paid_date: paidOff === null ? null : iso(paidOff), payment_method: paidOff === null ? null : "bank_transfer",
  receipt_path: null, voided_at: null, void_reason: null, status: paidOff === null ? "unpaid" : "paid",
});
const bill_ledger = [
  bill(6, -1, "Wickham Wax Supplies", "WW-2231", "Soy wax and wicks", "materials", "Stock and materials", 17900, 3580, null, 13),
  bill(5, -2, "Northgate Packaging", "NP-8814", "Gift boxes, 200", "packaging", "Packaging", 5242, 1048, -2, 28),
  bill(4, -9, "Brightline Couriers", "BL-5520", "October courier account", "delivery", "Delivery and courier", 8120, 1624, null, -2),
  bill(3, -12, "Cobalt Software", "CS-1190", "Shop software, annual add-on", "software", "Software and subscriptions", 4900, 980, -11, 18),
  bill(2, -16, "Marlow Estates", "ME-NOV", "Water and service charge", "premises", "Rent, rates and utilities", 12000, 0, -15, 14),
];
const expense_categories = [
  ["materials", "Stock and materials"], ["delivery", "Delivery and courier"], ["packaging", "Packaging"], ["advertising", "Advertising and marketing"],
  ["software", "Software and subscriptions"], ["premises", "Rent, rates and utilities"], ["office", "Office costs"], ["travel", "Travel and vehicle"],
  ["insurance", "Insurance"], ["professional", "Professional fees"], ["repairs", "Repairs and maintenance"], ["bank", "Bank and card charges"],
  ["equipment", "Equipment"], ["other", "Other"],
].map(([code, label]) => ({ code, label }));

const owed_by_customers = [
  { order_id: 41, order_reference: "HH-1041", contact_id: 1, customer_name: "Wren Cottage Café", invoiced_pence: 48000, paid_pence: 0, owed_pence: 48000, due_date: iso(-6), latest_invoice_number: "INV-0063" },
  { order_id: 43, order_reference: "HH-1043", contact_id: 2, customer_name: "The Barn Weddings", invoiced_pence: 126000, paid_pence: 60000, owed_pence: 66000, due_date: iso(9), latest_invoice_number: "INV-0065" },
  { order_id: 44, order_reference: "HH-1044", contact_id: 3, customer_name: "Alder Gift Shop", invoiced_pence: 31800, paid_pence: 0, owed_pence: 31800, due_date: iso(16), latest_invoice_number: "INV-0066" },
];
const owed_to_suppliers = [
  { id: 6, supplier_name: "Wickham Wax Supplies", reference: "WW-2231", description: "Soy wax and wicks", bill_date: iso(-1), due_date: iso(13), owed_pence: 21480, order_id: null },
  { id: 4, supplier_name: "Brightline Couriers", reference: "BL-5520", description: "October courier account", bill_date: iso(-9), due_date: iso(-2), owed_pence: 9744, order_id: null },
];

const claim = (id, who, off, pence, cat, desc, status, extra = {}) => ({
  id, claimant_id: who[2], claim_date: iso(off), amount_pence: pence, category: cat, description: desc, receipt_path: extra.receipt ? "1/claims/9/r.jpg" : null,
  status, decision_note: extra.note ?? null, decided_at: status === "pending" ? null : ts(off + 1), paid_at: status === "paid" ? iso(off + 2) : null,
  created_at: ts(off, 9 + id), receipt_hash: null, duplicate_of: extra.dup ?? null, duplicate_reason: extra.dup ? extra.reason : null,
  claimant: { first_name: who[0], last_name: who[1] },
});
const PRIYA = ["Priya", "Shah", 21], TOM = ["Tom", "Okafor", 22], LEAH = ["Leah", "Brennan", 23];
const expense_claims = [
  claim(15, TOM, 0, 4620, "stock", "Wax thermometers, Hobbycraft", "pending", { receipt: true }),
  claim(14, PRIYA, 0, 1250, "travel_out", "Parking at the craft fair", "pending", { receipt: true, dup: 12, reason: "same_person_amount" }),
  claim(13, LEAH, -1, 3890, "delivery_out", "Courier to wedding venue", "approved", { receipt: true }),
  claim(12, PRIYA, -2, 1250, "travel_out", "Parking at the craft fair (Saturday)", "paid", { receipt: true }),
  claim(11, TOM, -3, 2400, "office_out", "Printer ink", "rejected", { note: "Personal printer. Please use the shop one." }),
];

const week = (fromOff, vals) => ({ id: vals.id, week_from: iso(fromOff), week_to: iso(fromOff + 6), data: { week_from: iso(fromOff), week_to: iso(fromOff + 6), ...vals.d } });
const weekly_summaries = [
  week(-7, { id: 2, d: { money_in_pence: 412600, money_out_pence: 268400, owed_to_you_pence: 145800, owed_to_you_count: 3, owed_late_pence: 48000, owed_late_count: 1, you_owe_pence: 31224, bills_late_count: 1, bills_due_week_count: 2, bills_due_week_pence: 31224, low_stock_count: 4, orders_due_count: 6, customers_waiting_count: 2 } }),
  week(-14, { id: 1, d: { money_in_pence: 365200, money_out_pence: 251900, owed_to_you_pence: 98200, owed_to_you_count: 2, owed_late_pence: 0, owed_late_count: 0, you_owe_pence: 20900, bills_late_count: 0, bills_due_week_count: 1, bills_due_week_pence: 20900, low_stock_count: 2, orders_due_count: 5, customers_waiting_count: 1 } }),
];

// What the Money book already holds, for the "already recorded" check on the sheet.
const money_entries = [{ entry_date: iso(-3), amount_pence: 85000, direction: "out", counterparty: "Marlow Estates" }];

module.exports = { iso, tables: { money_ledger, money_categories: categories, bill_ledger, expense_categories, owed_by_customers, owed_to_suppliers, expense_claims, weekly_summaries, money_entries, business_settings: [] } };
