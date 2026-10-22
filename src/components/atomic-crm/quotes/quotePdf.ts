import { formatPence, quoteTotals, type QuoteLine } from "./quoteMath";

export type QuoteForPdf = {
  quote_number: string;
  status: string;
  lines: QuoteLine[];
  discount_percent: number;
  vat_percent: number;
  valid_until: string;
  notes: string | null;
  created_at: string;
};

// Seller name only. Address and VAT number are not in the CRM yet; add them here when
// they are given.
const SELLER = "Mere & Row";

// jsPDF is loaded on demand so the CRM does not carry it on every page.
export const downloadQuotePdf = async (
  quote: QuoteForPdf,
  customer: string,
) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(SELLER, left, y);
  doc.setFontSize(11);
  doc.text("Quote", right, y, { align: "right" });

  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(quote.quote_number, right, y, { align: "right" });
  y += 14;
  doc.text(
    `Date: ${new Date(quote.created_at).toLocaleDateString("en-GB")}`,
    right,
    y,
    { align: "right" },
  );
  y += 14;
  doc.text(
    `Valid until: ${new Date(quote.valid_until).toLocaleDateString("en-GB")}`,
    right,
    y,
    { align: "right" },
  );

  y += 36;
  doc.setFont("helvetica", "bold");
  doc.text("Prepared for", left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(customer || "Customer", left, y);

  y += 36;
  const cols = { description: left, qty: 360, unit: 430, line: right };
  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Description", cols.description, y);
    doc.text("Qty", cols.qty, y, { align: "right" });
    doc.text("Unit price", cols.unit, y, { align: "right" });
    doc.text("Amount", cols.line, y, { align: "right" });
    y += 6;
    doc.line(left, y, right, y);
    y += 14;
    doc.setFont("helvetica", "normal");
  };
  header();

  for (const line of quote.lines) {
    if (y > 740) {
      doc.addPage();
      y = 56;
      header();
    }
    doc.text(doc.splitTextToSize(line.description, 290), cols.description, y);
    doc.text(String(line.quantity), cols.qty, y, { align: "right" });
    doc.text(formatPence(line.unit_price_pence), cols.unit, y, {
      align: "right",
    });
    doc.text(formatPence(line.quantity * line.unit_price_pence), cols.line, y, {
      align: "right",
    });
    y += 18;
  }

  const totals = quoteTotals(
    quote.lines,
    quote.discount_percent,
    quote.vat_percent,
  );
  y += 8;
  doc.line(330, y, right, y);
  y += 16;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 330, y);
    doc.text(value, right, y, { align: "right" });
    y += 16;
  };
  row("Subtotal", formatPence(totals.subtotal_pence));
  if (quote.discount_percent > 0)
    row(
      `Discount (${quote.discount_percent}%)`,
      `-${formatPence(totals.discount_pence)}`,
    );
  row(`VAT (${quote.vat_percent}%)`, formatPence(totals.vat_pence));
  row("Total", formatPence(totals.total_pence), true);

  if (quote.notes) {
    y += 24;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", left, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(quote.notes, 499), left, y);
  }

  doc.save(`${quote.quote_number}.pdf`);
};
