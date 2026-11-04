import { CLAIM_CATEGORIES } from "../claims/claims";
import {
  daysBefore,
  isFuture,
  parseChoice,
  parseDate,
  parsePence,
  parseYesNo,
  type Choice,
  type Spec,
} from "./engine";

const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const METHODS: Choice[] = [
  { code: "cash", label: "Cash" },
  { code: "card", label: "Card" },
  {
    code: "bank_transfer",
    label: "Bank transfer",
    aliases: ["bank", "transfer"],
  },
  { code: "other", label: "Other" },
];

const list = (choices: Choice[]) => choices.map((c) => c.label).join(", ");

// ---- Staff expense claims (for the person sending them) --------------------------------------

export type ClaimRow = {
  claim_date: string;
  amount_pence: number;
  category: string;
  description: string;
};

export const claimsSpec = (now = new Date()): Spec<ClaimRow> => {
  const types: Choice[] = CLAIM_CATEGORIES.map((c) => ({ ...c }));
  return {
    id: "claims",
    title: "Expense claims",
    filename: "expense-claims-template",
    maxRows: 100,
    columns: [
      {
        key: "date",
        label: "Date",
        aliases: ["date of spend"],
        required: true,
        example: "04/11/2026",
        help: "The day you spent it, like 04/11/2026.",
      },
      {
        key: "amount",
        label: "Amount",
        aliases: ["cost", "total", "amount £"],
        required: true,
        example: "12.50",
        help: "In pounds, like 12.50. Up to £5,000.",
      },
      {
        key: "what",
        label: "What for",
        aliases: ["description", "details", "item"],
        required: true,
        example: "Parking at the Reading site",
        help: "A few words on what it was for.",
      },
      {
        key: "type",
        label: "Type",
        aliases: ["category"],
        example: "Travel and vehicle",
        help: `One of: ${list(types)}. Blank means Other.`,
      },
    ],
    notes: [
      "Each row becomes one claim, waiting for the administrator to approve.",
      "Photos of receipts cannot be sent in a sheet. Keep them, in case you are asked.",
      "Sending the same sheet twice sends every claim twice.",
    ],
    fingerprint: (v) =>
      [v.claim_date, v.amount_pence, v.description.trim().toLowerCase()].join(
        "|",
      ),
    previewHeadings: ["Date", "Amount", "What for", "Type"],
    preview: (v) => [
      shortDate(v.claim_date),
      pounds(v.amount_pence),
      v.description,
      types.find((t) => t.code === v.category)?.label ?? v.category,
    ],
    validate: (c) => {
      const errors: string[] = [];
      const date = parseDate(c.date);
      if (!date)
        errors.push("The date is missing or not a date (use 04/11/2026).");
      else if (isFuture(date, now)) errors.push("The date is in the future.");
      else if (daysBefore(date, now) > 366)
        errors.push("The date is more than a year ago.");
      const amount = parsePence(c.amount, { max: 500000 });
      if (amount === null)
        errors.push(
          "The amount must be like 12.50, more than 0 and up to £5,000.",
        );
      if (!c.what) errors.push("Say what it was for.");
      else if (c.what.length > 300)
        errors.push("What for is too long (300 characters at most).");
      let category = "other_out";
      if (c.type) {
        const found = parseChoice(c.type, types);
        if (!found)
          errors.push(`The type "${c.type}" is not one of: ${list(types)}.`);
        else category = found.code;
      }
      if (errors.length > 0) return { errors };
      return {
        errors,
        value: {
          claim_date: date!,
          amount_pence: amount!,
          category,
          description: c.what,
        },
      };
    },
  };
};

// ---- Money book (administrators) -------------------------------------------------------------

export type MoneyCategoryChoice = Choice & { direction: "in" | "out" };

export type MoneyRow = {
  direction: "in" | "out";
  category: string;
  status: "done";
  entry_date: string;
  amount_pence: number;
  counterparty: string | null;
  payment_method: string | null;
  reference: string | null;
  note: string;
};

export const moneySpec = (
  categories: MoneyCategoryChoice[],
  now = new Date(),
): Spec<MoneyRow> => ({
  id: "money",
  title: "Money book entries",
  filename: "money-book-template",
  maxRows: 500,
  columns: [
    {
      key: "date",
      label: "Date",
      required: true,
      example: "04/11/2026",
      help: "The day the money moved.",
    },
    {
      key: "type",
      label: "Type",
      aliases: ["category"],
      required: true,
      example: "Rent and utilities",
      help: "The money book category. It decides whether the money came in or went out. See the list in the notes.",
    },
    {
      key: "amount",
      label: "Amount",
      aliases: ["amount £", "total"],
      required: true,
      example: "850.00",
      help: "In pounds, always above 0 (the Type says in or out).",
    },
    {
      key: "who",
      label: "Who",
      aliases: ["paid to", "from", "counterparty", "supplier", "customer"],
      example: "Reading Lettings",
      help: "Who it was paid to or came from.",
    },
    {
      key: "method",
      label: "How paid",
      aliases: ["payment method", "method"],
      example: "Bank transfer",
      help: "Cash, Card, Bank transfer or Other.",
    },
    {
      key: "reference",
      label: "Reference",
      example: "Nov rent",
      help: "Any reference.",
    },
    {
      key: "note",
      label: "Note",
      aliases: ["description", "details"],
      example: "November rent for the unit",
      help: "At least 3 characters. If blank, Who or the Type is used.",
    },
  ],
  notes: [
    `Types you can use: ${list(categories)}.`,
    "Entries are added as done. VAT is not read from a sheet: for a bill with VAT, use the Bills import.",
    "A date inside a locked period is refused, and nothing is added.",
    "Sending the same sheet twice adds every entry twice.",
  ],
  previewHeadings: ["Date", "In or out", "Type", "Amount", "Who"],
  preview: (v) => [
    shortDate(v.entry_date),
    v.direction === "in" ? "In" : "Out",
    categories.find((c) => c.code === v.category)?.label ?? v.category,
    pounds(v.amount_pence),
    v.counterparty ?? "",
  ],
  validate: (c) => {
    const errors: string[] = [];
    const date = parseDate(c.date);
    if (!date)
      errors.push("The date is missing or not a date (use 04/11/2026).");
    else if (isFuture(date, now)) errors.push("The date is in the future.");
    const type = parseChoice(c.type, categories) as MoneyCategoryChoice | null;
    if (!c.type) errors.push("The type is missing.");
    else if (!type)
      errors.push(
        `"${c.type}" is not a money book type. See the notes for the list.`,
      );
    const amount = parsePence(c.amount, { max: 100_000_000_000 });
    if (amount === null)
      errors.push("The amount must be like 850.00 and more than 0.");
    let method: string | null = null;
    if (c.method) {
      const found = parseChoice(c.method, METHODS);
      if (!found)
        errors.push(`How paid "${c.method}" is not one of: ${list(METHODS)}.`);
      else method = found.code;
    }
    const note = c.note || c.who || type?.label || "";
    if (note.length > 0 && note.length < 3)
      errors.push("The note needs at least 3 characters.");
    if (errors.length > 0 || !type) return { errors };
    return {
      errors,
      value: {
        direction: type.direction,
        category: type.code,
        status: "done",
        entry_date: date!,
        amount_pence: amount!,
        counterparty: c.who || null,
        payment_method: method,
        reference: c.reference || null,
        note,
      },
    };
  },
});

// ---- Supplier bills (administrators) ---------------------------------------------------------

export type BillRow = {
  supplier_name: string;
  reference: string | null;
  bill_date: string;
  due_date: string | null;
  category: string;
  description: string;
  vat_code: "S" | "O";
  net_pence: number;
  vat_pence: number;
  vat_reclaimable: boolean;
  paid_date: string | null;
  payment_method: string | null;
};

const BILL_METHODS = METHODS.filter((m) => m.code !== "other");

export const billsSpec = (
  categories: Choice[],
  now = new Date(),
): Spec<BillRow> => ({
  id: "bills",
  title: "Supplier bills",
  filename: "bills-template",
  maxRows: 500,
  columns: [
    {
      key: "date",
      label: "Bill date",
      aliases: ["date"],
      required: true,
      example: "04/11/2026",
      help: "The date on the bill.",
    },
    {
      key: "supplier",
      label: "Supplier",
      required: true,
      example: "Screwfix",
      help: "Who sent the bill.",
    },
    {
      key: "what",
      label: "What for",
      aliases: ["description", "details"],
      required: true,
      example: "Fixings and paint",
      help: "A few words on what it was for.",
    },
    {
      key: "type",
      label: "Category",
      aliases: ["type"],
      example: "Stock and materials",
      help: `One of: ${list(categories)}. Blank means Other.`,
    },
    {
      key: "net",
      label: "Amount before VAT",
      aliases: ["net", "net amount", "amount"],
      required: true,
      example: "100.00",
      help: "In pounds, before VAT.",
    },
    {
      key: "vat",
      label: "VAT",
      aliases: ["vat amount"],
      example: "20.00",
      help: "The VAT in pounds. Blank means no VAT.",
    },
    {
      key: "reclaim",
      label: "VAT reclaimable",
      aliases: ["reclaimable"],
      example: "Yes",
      help: "Yes or No. Blank means Yes when there is VAT.",
    },
    {
      key: "reference",
      label: "Reference",
      aliases: ["invoice number", "invoice no"],
      example: "INV-1042",
      help: "The supplier's invoice number.",
    },
    {
      key: "due",
      label: "Due date",
      example: "04/12/2026",
      help: "When it has to be paid.",
    },
    {
      key: "paid",
      label: "Paid on",
      aliases: ["paid date", "date paid"],
      example: "",
      help: "The day you paid it. Blank means not paid yet.",
    },
    {
      key: "method",
      label: "How paid",
      aliases: ["payment method", "method"],
      example: "",
      help: "Cash, Card or Bank transfer. Only for a bill that is paid.",
    },
  ],
  notes: [
    "Gross is worked out for you: amount before VAT plus VAT.",
    "A bill with VAT is recorded as standard rated. Check with your accountant if you are not sure whether the VAT can be reclaimed.",
    "A date inside a locked period is refused, and nothing is added.",
    "Receipts cannot be sent in a sheet. Add them to each bill afterwards.",
    "Sending the same sheet twice adds every bill twice.",
  ],
  previewHeadings: [
    "Date",
    "Supplier",
    "What for",
    "Before VAT",
    "VAT",
    "Paid",
  ],
  preview: (v) => [
    shortDate(v.bill_date),
    v.supplier_name,
    v.description,
    pounds(v.net_pence),
    pounds(v.vat_pence),
    v.paid_date ? shortDate(v.paid_date) : "Not yet",
  ],
  validate: (c) => {
    const errors: string[] = [];
    const date = parseDate(c.date);
    if (!date)
      errors.push("The bill date is missing or not a date (use 04/11/2026).");
    else if (isFuture(date, now))
      errors.push("The bill date is in the future.");
    if (!c.supplier) errors.push("The supplier is missing.");
    if (!c.what) errors.push("Say what the bill was for.");
    let category = "other";
    if (c.type) {
      const found = parseChoice(c.type, categories);
      if (!found)
        errors.push(
          `The category "${c.type}" is not one of: ${list(categories)}.`,
        );
      else category = found.code;
    }
    const net = parsePence(c.net, { max: 100_000_000_000, allowZero: true });
    if (net === null) errors.push("The amount before VAT must be like 100.00.");
    let vat = 0;
    if (c.vat) {
      const parsed = parsePence(c.vat, {
        max: 100_000_000_000,
        allowZero: true,
      });
      if (parsed === null) errors.push("The VAT must be like 20.00.");
      else vat = parsed;
    }
    if (net !== null && vat > net)
      errors.push("The VAT cannot be more than the amount before VAT.");
    let reclaimable = true;
    if (c.reclaim) {
      const yn = parseYesNo(c.reclaim);
      if (yn === null) errors.push("VAT reclaimable must be Yes or No.");
      else reclaimable = yn;
    }
    let due: string | null = null;
    if (c.due) {
      due = parseDate(c.due);
      if (!due) errors.push("The due date is not a date (use 04/12/2026).");
    }
    let paid: string | null = null;
    if (c.paid) {
      paid = parseDate(c.paid);
      if (!paid) errors.push("The paid date is not a date (use 04/11/2026).");
      else if (isFuture(paid, now))
        errors.push("The paid date is in the future.");
    }
    let method: string | null = null;
    if (c.method) {
      const found = parseChoice(c.method, BILL_METHODS);
      if (!found)
        errors.push(
          `How paid "${c.method}" is not one of: ${list(BILL_METHODS)}.`,
        );
      else method = found.code;
      if (!paid)
        errors.push("How paid needs a Paid on date, or leave both blank.");
    }
    if (errors.length > 0) return { errors };
    return {
      errors,
      value: {
        supplier_name: c.supplier,
        reference: c.reference || null,
        bill_date: date!,
        due_date: due,
        category,
        description: c.what,
        vat_code: vat > 0 ? "S" : "O",
        net_pence: net!,
        vat_pence: vat,
        vat_reclaimable: vat > 0 ? reclaimable : true,
        paid_date: paid,
        payment_method: method,
      },
    };
  },
});
