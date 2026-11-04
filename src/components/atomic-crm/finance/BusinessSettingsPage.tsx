import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useGetIdentity, useGetOne, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useExpenseCategories } from "./useBills";
import {
  BUSINESS_SETTINGS_KEY,
  useBusinessSettings,
  type BusinessSettings,
} from "./useBusinessSettings";
import { isValidUkVatNumber, normaliseVatNumber } from "./vatMath";

type Form = {
  organisation_name: string;
  legal_name: string;
  trading_name: string;
  address: string;
  company_number: string;
  vat_registered: boolean;
  vat_number: string;
  vat_scheme: BusinessSettings["vat_scheme"];
  flat_rate_percent: string;
  prices_include_vat: boolean;
  invoice_prefix: string;
  books_locked_until: string;
  code_sales: string;
  code_bank: string;
  code_bills: Record<string, string>;
};

const empty: Form = {
  organisation_name: "",
  legal_name: "",
  trading_name: "",
  address: "",
  company_number: "",
  vat_registered: false,
  vat_number: "",
  vat_scheme: "standard",
  flat_rate_percent: "",
  prices_include_vat: true,
  invoice_prefix: "INV-",
  books_locked_until: "",
  code_sales: "",
  code_bank: "",
  code_bills: {},
};

const fromSettings = (
  s: BusinessSettings | null | undefined,
  organisationName: string,
): Form =>
  s
    ? {
        organisation_name: organisationName,
        legal_name: s.legal_name ?? "",
        trading_name: s.trading_name ?? "",
        address: s.address ?? "",
        company_number: s.company_number ?? "",
        vat_registered: s.vat_registered,
        vat_number: s.vat_number ?? "",
        vat_scheme: s.vat_scheme,
        flat_rate_percent:
          s.flat_rate_percent == null ? "" : String(s.flat_rate_percent),
        prices_include_vat: s.prices_include_vat,
        invoice_prefix: s.invoice_prefix,
        books_locked_until: s.books_locked_until ?? "",
        code_sales: s.accounting_codes?.sales ?? "",
        code_bank: s.accounting_codes?.bank ?? "",
        code_bills: s.accounting_codes?.bills ?? {},
      }
    : { ...empty, organisation_name: organisationName };

// Problems with what was typed, in plain words. Empty means it can be saved.
const problems = (form: Form): string[] => {
  const out: string[] = [];
  if (form.vat_registered) {
    if (!form.vat_number.trim()) out.push("Enter the VAT number.");
    else if (!isValidUkVatNumber(normaliseVatNumber(form.vat_number)))
      out.push("The VAT number should look like GB123456789.");
    if (form.vat_scheme === "flat_rate") {
      const pct = Number(form.flat_rate_percent);
      if (form.flat_rate_percent === "" || !(pct >= 0 && pct <= 30))
        out.push("Enter the flat rate percentage, between 0 and 30.");
    }
  }
  if (form.invoice_prefix.length > 10)
    out.push("The invoice prefix can be at most 10 characters.");
  return out;
};

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

// One page for the details every invoice carries, and the optional VAT switch. It is for
// administrators; everyone else can read the saved values elsewhere but not change them.
export const BusinessSettingsPage = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const { data: sale } = useGetOne(
    "sales",
    { id: identity?.id },
    { enabled: !!identity?.id },
  );
  const { data: settings, isPending } = useBusinessSettings();
  const { data: categories = [] } = useExpenseCategories();
  const { data: organisationName, isPending: namePending } = useQuery({
    queryKey: ["organisation_name"],
    queryFn: async () => {
      const { data } = await getSupabaseClient()
        .from("organisations")
        .select("name")
        .maybeSingle();
      return (data?.name as string | undefined) ?? "";
    },
  });
  const [form, setForm] = useState<Form>(empty);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isPending && !namePending)
      setForm(fromSettings(settings, organisationName ?? ""));
  }, [isPending, namePending, settings, organisationName]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const issues = problems(form);

  const save = useMutation({
    mutationFn: async () => {
      if (!sale?.organisation_id)
        throw new Error("Your business was not found.");
      const row = {
        organisation_id: sale.organisation_id as number,
        legal_name: blank(form.legal_name),
        trading_name: blank(form.trading_name),
        address: blank(form.address),
        company_number: blank(form.company_number),
        vat_registered: form.vat_registered,
        vat_number: form.vat_registered
          ? normaliseVatNumber(form.vat_number)
          : null,
        vat_scheme: form.vat_scheme,
        flat_rate_percent:
          form.vat_registered && form.vat_scheme === "flat_rate"
            ? Number(form.flat_rate_percent)
            : null,
        prices_include_vat: form.prices_include_vat,
        invoice_prefix: form.invoice_prefix.trim() || "INV-",
        // Sent only when the column exists (the saved settings carry it) or a date was entered, so
        // saving stays safe on a database that does not have the lock yet.
        ...(settings && "books_locked_until" in settings
          ? { books_locked_until: form.books_locked_until || null }
          : form.books_locked_until
            ? { books_locked_until: form.books_locked_until }
            : {}),
        accounting_codes: {
          ...(form.code_sales.trim() ? { sales: form.code_sales.trim() } : {}),
          ...(form.code_bank.trim() ? { bank: form.code_bank.trim() } : {}),
          bills: Object.fromEntries(
            Object.entries(form.code_bills)
              .map(([k, v]) => [k, v.trim()])
              .filter(([, v]) => v),
          ),
        },
        updated_at: new Date().toISOString(),
      };
      const client = getSupabaseClient();
      const { error } = await client
        .from("business_settings")
        .upsert(row, { onConflict: "organisation_id" });
      if (error) throw error;
      if (form.organisation_name.trim()) {
        const { error: nameError } = await client
          .from("organisations")
          .update({ name: form.organisation_name.trim() })
          .eq("id", row.organisation_id);
        if (nameError) throw nameError;
      }
    },
    onSuccess: () => {
      notify("Business details saved", { type: "success" });
      queryClient.invalidateQueries({ queryKey: ["organisation_name"] });
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: BUSINESS_SETTINGS_KEY });
    },
    onError: (error: Error) =>
      notify(
        error.message.includes("row-level security")
          ? "Only an administrator can change these details."
          : error.message,
        { type: "error" },
      ),
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Building2 className="size-6 text-muted-foreground" /> Business and VAT
      </h1>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Business details</h2>
          <p className="text-sm text-muted-foreground">
            These appear on invoices and credit notes.
          </p>
        </div>
        <Field id="org-name" label="Business name (shown in the app)">
          <Input
            id="org-name"
            value={form.organisation_name}
            onChange={(e) => set("organisation_name", e.target.value)}
          />
        </Field>
        <Field id="legal-name" label="Registered or legal name">
          <Input
            id="legal-name"
            value={form.legal_name}
            onChange={(e) => set("legal_name", e.target.value)}
          />
        </Field>
        <Field id="trading-name" label="Trading name (if different)">
          <Input
            id="trading-name"
            value={form.trading_name}
            onChange={(e) => set("trading_name", e.target.value)}
          />
        </Field>
        <Field id="address" label="Address">
          <textarea
            id="address"
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <Field
          id="company-number"
          label="Company number (if a limited company)"
        >
          <Input
            id="company-number"
            value={form.company_number}
            onChange={(e) => set("company_number", e.target.value)}
          />
        </Field>
        <Field id="invoice-prefix" label="Invoice number prefix">
          <Input
            id="invoice-prefix"
            className="w-32"
            maxLength={10}
            value={form.invoice_prefix}
            onChange={(e) => set("invoice_prefix", e.target.value)}
          />
        </Field>
        <Field
          id="books-locked-until"
          label="Lock the books up to"
          hint="Once your accountant has signed a month off, set this to its last day. Nothing dated on or before it can then be added or changed in invoices, bills, the money book or customer payments. Clear it to unlock."
        >
          <Input
            id="books-locked-until"
            type="date"
            className="w-44"
            value={form.books_locked_until}
            onChange={(e) => set("books_locked_until", e.target.value)}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">VAT</h2>
            <p className="text-sm text-muted-foreground">
              Turn this on only if the business is registered for VAT. When it
              is off, no VAT is shown or added anywhere.
            </p>
          </div>
          <Switch
            checked={form.vat_registered}
            onCheckedChange={(on) => set("vat_registered", on)}
            aria-label="VAT registered"
          />
        </div>

        {form.vat_registered && (
          <>
            <Field id="vat-number" label="VAT number">
              <Input
                id="vat-number"
                placeholder="GB123456789"
                value={form.vat_number}
                onChange={(e) => set("vat_number", e.target.value)}
              />
            </Field>
            <Field id="vat-scheme" label="VAT scheme">
              <select
                id="vat-scheme"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.vat_scheme}
                onChange={(e) =>
                  set("vat_scheme", e.target.value as Form["vat_scheme"])
                }
              >
                <option value="standard">Standard</option>
                <option value="flat_rate">Flat rate</option>
                <option value="cash">Cash accounting</option>
              </select>
            </Field>
            {form.vat_scheme === "flat_rate" && (
              <Field id="flat-rate" label="Flat rate percentage">
                <Input
                  id="flat-rate"
                  className="w-32"
                  inputMode="decimal"
                  value={form.flat_rate_percent}
                  onChange={(e) => set("flat_rate_percent", e.target.value)}
                />
              </Field>
            )}
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="prices-incl">Prices include VAT</Label>
                <p className="text-sm text-muted-foreground">
                  On for consumers (the price shown is what they pay). Off for
                  business customers (VAT is added on top).
                </p>
              </div>
              <Switch
                id="prices-incl"
                checked={form.prices_include_vat}
                onCheckedChange={(on) => set("prices_include_vat", on)}
              />
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">
            Accountant codes (optional)
          </h2>
          <p className="text-sm text-muted-foreground">
            Your accountant gives you these. They go into the files for Xero,
            QuickBooks and Sage so each line lands in the right account. Leave
            blank if you do not have them.
          </p>
        </div>
        <Field id="code-sales" label="Sales account code">
          <Input
            id="code-sales"
            className="w-40"
            value={form.code_sales}
            onChange={(e) => set("code_sales", e.target.value)}
          />
        </Field>
        <Field
          id="code-bank"
          label="Bank account code (for the bank-style files)"
        >
          <Input
            id="code-bank"
            className="w-40"
            value={form.code_bank}
            onChange={(e) => set("code_bank", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <Field key={c.code} id={`code-${c.code}`} label={c.label}>
              <Input
                id={`code-${c.code}`}
                className="w-40"
                value={form.code_bills[c.code] ?? ""}
                onChange={(e) =>
                  set("code_bills", {
                    ...form.code_bills,
                    [c.code]: e.target.value,
                  })
                }
              />
            </Field>
          ))}
        </div>
      </section>

      {touched && issues.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          disabled={!touched || issues.length > 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <p className="text-sm text-muted-foreground">
          These figures support your accountant. They are not tax advice.
        </p>
      </div>
    </div>
  );
};

const Field = ({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);
