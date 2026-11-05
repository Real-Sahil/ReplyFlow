import { formatMoneyPdf as formatPence } from "../markets/moneyFormat";
import {
  BUCKET_LABEL,
  ageing,
  type AgeBucket,
  type Statement,
} from "./statement";

const ukDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB");

// jsPDF is loaded on demand so the CRM does not carry it on every page. The statement carries no bank
// details; those are shared another way.
export const downloadStatementPdf = async (input: {
  business: string;
  customer: string;
  today: string;
  statement: Statement;
}) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  const bottom = 790;
  let y = 56;

  doc
    .setFont("helvetica", "bold")
    .setFontSize(18)
    .text(input.business, left, y);
  y += 24;
  doc
    .setFont("helvetica", "normal")
    .setFontSize(12)
    .text("Statement of account", left, y);
  y += 28;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(12)
    .text(input.customer, left, y);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .text(`As at ${ukDate(input.today)}`, right, y, { align: "right" });
  y += 28;

  const head = () => {
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text("Date", left, y);
    doc.text("What", left + 70, y);
    doc.text("Charged", 410, y, { align: "right" });
    doc.text("Paid or credited", 480, y, { align: "right" });
    doc.text("Balance", right, y, { align: "right" });
    y += 6;
    doc.setDrawColor(180).line(left, y, right, y);
    y += 14;
    doc.setFont("helvetica", "normal");
  };
  head();
  for (const r of input.statement.rows) {
    if (y > bottom) {
      doc.addPage();
      y = 56;
      head();
    }
    const what =
      r.kind === "payment"
        ? "Payment received"
        : r.kind === "credit_note"
          ? `Credit note ${r.reference ?? ""}`
          : `Invoice ${r.reference ?? ""}`;
    doc.setFontSize(9);
    doc.text(ukDate(r.line_date), left, y);
    doc.text(
      `${what}${r.order_reference ? `  (${r.order_reference})` : ""}`.trim(),
      left + 70,
      y,
      { maxWidth: 230 },
    );
    if (r.debit_pence)
      doc.text(formatPence(r.debit_pence), 410, y, { align: "right" });
    if (r.credit_pence)
      doc.text(formatPence(r.credit_pence), 480, y, { align: "right" });
    doc.text(formatPence(r.balance_pence), right, y, { align: "right" });
    y += 16;
  }
  y += 8;
  if (y > bottom - 90) {
    doc.addPage();
    y = 56;
  }
  doc.setDrawColor(180).line(left, y, right, y);
  y += 20;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(12)
    .text("Total outstanding", left, y);
  doc.text(formatPence(input.statement.balancePence), right, y, {
    align: "right",
  });
  y += 22;
  if (input.statement.openInvoices.length > 0) {
    const a = ageing(input.statement.openInvoices);
    doc.setFont("helvetica", "normal").setFontSize(9);
    for (const key of Object.keys(a) as AgeBucket[]) {
      if (a[key] === 0) continue;
      doc.text(BUCKET_LABEL[key], left, y);
      doc.text(formatPence(a[key]), right, y, { align: "right" });
      y += 14;
    }
  }
  doc.save(
    `statement-${input.customer.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${input.today}.pdf`,
  );
};
