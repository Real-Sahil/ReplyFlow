import { formatMoneyPdf as formatPence } from "../markets/moneyFormat";
import { CHANNEL_LABEL } from "./moneyTypes";

// A row of the cash_book view: a customer payment, a supplier bill or a money-book entry.
export type CashRow = {
  source: "order_payment" | "bill" | "entry";
  source_id: number;
  entry_date: string;
  direction: "in" | "out";
  category_group: string;
  category_label: string;
  state: "done" | "planned" | "void";
  amount_pence: number;
  counterparty: string | null;
  payment_method: string | null;
  reference: string | null;
  channel: string | null;
  order_reference: string | null;
  order_summary: string | null;
  order_note: string | null;
  regulated: boolean;
  receipt_path: string | null;
  note: string;
  void_reason: string | null;
  vat_pence: number;
};

const ukDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB");

const signed = (r: CashRow) =>
  r.direction === "in" ? r.amount_pence : -r.amount_pence;

export type Summary = {
  inDone: number;
  outDone: number;
  inPlanned: number;
  outPlanned: number;
  byCategory: {
    group: string;
    label: string;
    inPence: number;
    outPence: number;
  }[];
  byChannel: { label: string; pence: number }[];
  regulated: { label: string; pence: number }[];
  voided: number;
};

// The totals the report opens with. Voided rows are counted but left out of every figure.
export const summarise = (rows: CashRow[]): Summary => {
  const live = rows.filter((r) => r.state !== "void");
  const sum = (xs: CashRow[]) => xs.reduce((a, r) => a + r.amount_pence, 0);
  const cats = new Map<
    string,
    { group: string; label: string; inPence: number; outPence: number }
  >();
  for (const r of live.filter((x) => x.state === "done")) {
    const key = `${r.category_group}|${r.category_label}`;
    const c = cats.get(key) ?? {
      group: r.category_group,
      label: r.category_label,
      inPence: 0,
      outPence: 0,
    };
    if (r.direction === "in") c.inPence += r.amount_pence;
    else c.outPence += r.amount_pence;
    cats.set(key, c);
  }
  const channels = new Map<string, number>();
  for (const r of live.filter(
    (x) => x.state === "done" && x.direction === "in",
  )) {
    const label = r.channel
      ? (CHANNEL_LABEL[r.channel as keyof typeof CHANNEL_LABEL] ?? r.channel)
      : "Not stated";
    channels.set(label, (channels.get(label) ?? 0) + r.amount_pence);
  }
  const reg = new Map<string, number>();
  for (const r of live.filter((x) => x.state === "done" && x.regulated)) {
    reg.set(
      r.category_label,
      (reg.get(r.category_label) ?? 0) + r.amount_pence,
    );
  }
  return {
    inDone: sum(live.filter((r) => r.direction === "in" && r.state === "done")),
    outDone: sum(
      live.filter((r) => r.direction === "out" && r.state === "done"),
    ),
    inPlanned: sum(
      live.filter((r) => r.direction === "in" && r.state === "planned"),
    ),
    outPlanned: sum(
      live.filter((r) => r.direction === "out" && r.state === "planned"),
    ),
    byCategory: [...cats.values()].sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.label.localeCompare(b.label),
    ),
    byChannel: [...channels]
      .map(([label, pence]) => ({ label, pence }))
      .sort((a, b) => b.pence - a.pence),
    regulated: [...reg].map(([label, pence]) => ({ label, pence })),
    voided: rows.length - live.length,
  };
};

// jsPDF is loaded on demand, so the CRM does not carry it on every page.
export const downloadCashBookPdf = async (input: {
  businessName: string;
  periodLabel: string;
  rows: CashRow[];
  includesPrivate: boolean;
}) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  const bottom = 780;
  let y = 56;
  const rows = [...input.rows]
    .filter((r) => r.state !== "void")
    .sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        a.source.localeCompare(b.source),
    );
  const s = summarise(input.rows);

  const ensure = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = 56;
    }
  };
  const heading = (text: string) => {
    ensure(40);
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, left, y);
    y += 8;
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);
    y += 16;
    doc.setFontSize(10);
  };
  const line = (label: string, value: string, bold = false) => {
    ensure(16);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, left, y);
    doc.text(value, right, y, { align: "right" });
    y += 15;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(input.businessName || "Cash book", left, y);
  doc.setFontSize(11);
  doc.text("Cash book report", right, y, { align: "right" });
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Period: ${input.periodLabel}`, left, y);
  doc.text(`Prepared ${new Date().toLocaleDateString("en-GB")}`, right, y, {
    align: "right",
  });

  heading("Summary");
  line("Money in", formatPence(s.inDone));
  line("Money out", formatPence(s.outDone));
  line("Net", formatPence(s.inDone - s.outDone), true);
  if (s.inPlanned || s.outPlanned) {
    line("Planned money in (not yet received)", formatPence(s.inPlanned));
    line("Planned money out (not yet paid)", formatPence(s.outPlanned));
  }

  heading("By category");
  let group = "";
  for (const c of s.byCategory) {
    if (c.group !== group) {
      group = c.group;
      ensure(18);
      doc.setFont("helvetica", "bold");
      doc.text(group, left, y);
      y += 14;
    }
    ensure(14);
    doc.setFont("helvetica", "normal");
    doc.text(c.label, left + 12, y);
    if (c.inPence)
      doc.text(`In ${formatPence(c.inPence)}`, 430, y, { align: "right" });
    if (c.outPence)
      doc.text(`Out ${formatPence(c.outPence)}`, right, y, { align: "right" });
    y += 14;
  }

  if (s.byChannel.length) {
    heading("Money in by where it came from");
    for (const c of s.byChannel) line(c.label, formatPence(c.pence));
  }
  if (s.regulated.length) {
    heading("Regulated payments recorded");
    for (const c of s.regulated) line(c.label, formatPence(c.pence));
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(
      "Recorded as entered. Nothing here is calculated or filed.",
      left,
      y,
    );
    doc.setFontSize(10);
    y += 14;
  }

  heading(`Every entry (${rows.length})`);
  const cols = {
    date: left,
    what: left + 62,
    note: left + 200,
    order: 410,
    amount: right,
  };
  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.text("Date", cols.date, y);
    doc.text("What", cols.what, y);
    doc.text("Note", cols.note, y);
    doc.text("Order", cols.order, y);
    doc.text("Amount", cols.amount, y, { align: "right" });
    y += 5;
    doc.line(left, y, right, y);
    y += 12;
    doc.setFont("helvetica", "normal");
  };
  header();
  for (const r of rows) {
    const what = doc.splitTextToSize(
      [r.category_label, r.counterparty].filter(Boolean).join(" - "),
      132,
    );
    const note = doc.splitTextToSize(
      r.state === "planned" ? `(Planned) ${r.note}` : r.note,
      200,
    );
    const height = Math.max(what.length, note.length, 1) * 12 + 6;
    if (y + height > bottom) {
      doc.addPage();
      y = 56;
      header();
    }
    doc.setFontSize(9);
    doc.text(ukDate(r.entry_date), cols.date, y);
    doc.text(what, cols.what, y);
    doc.text(note, cols.note, y);
    if (r.order_reference) doc.text(r.order_reference, cols.order, y);
    doc.text(
      `${r.direction === "in" ? "+" : "-"}${formatPence(r.amount_pence)}`,
      cols.amount,
      y,
      { align: "right" },
    );
    doc.setFontSize(10);
    y += height;
  }

  const notes = [
    "Prepared from the records this business entered. It is not an audited statement.",
    ...(s.voided
      ? [
          `${s.voided} voided ${s.voided === 1 ? "entry is" : "entries are"} left out of every figure.`,
        ]
      : []),
    ...(input.includesPrivate
      ? []
      : [
          "Private categories such as wages are shown only in an administrator's report.",
        ]),
  ];
  ensure(notes.length * 13 + 20);
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  for (const n of notes) {
    doc.text(doc.splitTextToSize(n, right - left), left, y);
    y += 13;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `${input.businessName} - cash book - ${input.periodLabel}`,
      left,
      820,
    );
    doc.text(`Page ${p} of ${pages}`, right, 820, { align: "right" });
  }
  doc.save(`cash-book-${input.periodLabel.replaceAll(" ", "_")}.pdf`);
  void signed;
};
