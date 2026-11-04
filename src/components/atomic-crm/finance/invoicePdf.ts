import { formatPence } from "../quotes/quoteMath";
import type { Invoice, InvoiceLine } from "./invoiceTypes";
import { kindLabel } from "./invoiceTypes";

const date = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");

// jsPDF is loaded on demand so the CRM does not carry it on every page. Everything printed
// is read from the saved document, never from today's settings, so an old invoice always
// prints as it was issued.
export const downloadInvoicePdf = async (
  invoice: Invoice,
  lines: InvoiceLine[],
  creditedNumber?: string,
) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  let y = 56;
  const credit = invoice.kind === "credit_note";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(invoice.supplier_name, left, y);
  doc.setFontSize(12);
  doc.text(
    invoice.vat_registered && !credit ? "Tax invoice" : kindLabel(invoice.kind),
    right,
    y,
    { align: "right" },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let sy = y + 18;
  if (invoice.supplier_address) {
    const addr = doc.splitTextToSize(invoice.supplier_address, 240);
    doc.text(addr, left, sy);
    sy += addr.length * 13;
  }
  if (invoice.vat_registered && invoice.supplier_vat_number) {
    doc.text(`VAT number: ${invoice.supplier_vat_number}`, left, sy);
    sy += 13;
  }

  let ry = y + 18;
  const rightRow = (text: string) => {
    doc.text(text, right, ry, { align: "right" });
    ry += 14;
  };
  rightRow(invoice.number);
  rightRow(`Date: ${date(invoice.issue_date)}`);
  if (!credit && invoice.due_date) rightRow(`Due: ${date(invoice.due_date)}`);
  if (credit && creditedNumber) rightRow(`Credits: ${creditedNumber}`);
  rightRow(`Order: ${invoice.order_reference}`);

  y = Math.max(sy, ry) + 22;
  doc.setFont("helvetica", "bold");
  doc.text(credit ? "Credited to" : "Billed to", left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(invoice.customer_name || "Customer", left, y);
  if (invoice.customer_address) {
    const addr = doc.splitTextToSize(invoice.customer_address, 260);
    y += 13;
    doc.text(addr, left, y);
    y += (addr.length - 1) * 13;
  }

  y += 30;
  const showVat = invoice.vat_registered;
  const cols = showVat
    ? { desc: left, qty: 300, unit: 370, vat: 420, amount: right }
    : { desc: left, qty: 380, unit: 460, vat: 0, amount: right };
  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.text("Description", cols.desc, y);
    doc.text("Qty", cols.qty, y, { align: "right" });
    doc.text("Unit price", cols.unit, y, { align: "right" });
    if (showVat) doc.text("VAT", cols.vat, y, { align: "right" });
    doc.text("Amount", cols.amount, y, { align: "right" });
    y += 6;
    doc.line(left, y, right, y);
    y += 14;
    doc.setFont("helvetica", "normal");
  };
  header();

  for (const line of lines) {
    if (y > 720) {
      doc.addPage();
      y = 56;
      header();
    }
    const desc = doc.splitTextToSize(line.description, showVat ? 235 : 310);
    doc.text(desc, cols.desc, y);
    doc.text(String(Number(line.quantity)), cols.qty, y, { align: "right" });
    doc.text(formatPence(line.unit_amount_pence), cols.unit, y, {
      align: "right",
    });
    if (showVat)
      doc.text(`${Number(line.vat_percent)}%`, cols.vat, y, { align: "right" });
    doc.text(
      formatPence(
        invoice.prices_include_vat ? line.gross_pence : line.net_pence,
      ),
      cols.amount,
      y,
      { align: "right" },
    );
    y += Math.max(18, desc.length * 13 + 4);
  }

  y += 8;
  doc.line(330, y, right, y);
  y += 16;
  const total = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 330, y);
    doc.text(value, right, y, { align: "right" });
    y += 16;
  };
  if (showVat) {
    total("Total excluding VAT", formatPence(invoice.net_pence));
    total("VAT", formatPence(invoice.vat_pence));
  }
  total(
    credit ? "Total credited" : "Total to pay",
    formatPence(invoice.gross_pence),
    true,
  );

  const notes = [invoice.note, invoice.order_note].filter(Boolean) as string[];
  if (notes.length) {
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", left, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(notes.join("\n"), 499), left, y);
  }

  doc.save(`${invoice.number}.pdf`);
};
