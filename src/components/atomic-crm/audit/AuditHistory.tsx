import { useQuery } from "@tanstack/react-query";
import { useGetList } from "ra-core";
import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { orderStatusLabel } from "../orders/statuses";
import { formatPrice } from "../products/formatPrice";

export type AuditEntry = {
  id: number;
  table_name: string;
  action: "insert" | "update" | "delete";
  actor_id: number | null;
  changed_at: string;
  changes: Record<string, unknown>;
};

type Staff = { id: number; first_name: string; last_name: string };

const labels: Record<string, string> = {
  status: "Status",
  stage: "Stage",
  name: "Name",
  first_name: "First name",
  last_name: "Last name",
  product_summary: "Item",
  quoted_price_pence: "Quoted price",
  agreed_price_pence: "Agreed price",
  deposit_required_pence: "Deposit due",
  paid_pence: "Paid so far",
  price_pence: "Price",
  original_price_pence: "Original price",
  delivery_window_start: "Delivery from",
  delivery_window_end: "Delivery to",
  delivery_address: "Delivery address",
  next_update_due: "Next update due",
  last_customer_update_at: "Last customer update",
  notes: "Notes",
  configuration: "Specification",
  title: "Title",
  active: "Available",
  amount: "Amount",
  description: "Description",
  sales_id: "Owner",
  archived_at: "Archived",
};

const recordLabels: Record<string, string> = {
  contacts: "Contact",
  deals: "Deal",
  orders: "Order",
  products: "Product",
};

const show = (
  key: string,
  value: unknown,
  stageLabel: (value: string) => string,
): string => {
  if (value === null || value === undefined || value === "") return "empty";
  if (key === "stage" && typeof value === "string") return stageLabel(value);
  if (key.endsWith("_pence") && typeof value === "number")
    return formatPrice(value);
  if (key === "status" && typeof value === "string")
    return orderStatusLabel(value);
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 120);
};

const describe = (entry: AuditEntry, stageLabel: (value: string) => string) => {
  if (entry.action === "insert") return ["Created"];
  if (entry.action === "delete") return ["Deleted"];
  return Object.entries(entry.changes).map(([key, change]) => {
    const { old, new: next } = change as { old: unknown; new: unknown };
    return `${labels[key] ?? key}: ${show(key, old, stageLabel)} → ${show(key, next, stageLabel)}`;
  });
};

// The list of changes, newest first. Used for one record's history and for a
// contact's history across its deals and orders.
export const AuditEntryList = ({
  entries,
  showRecord = false,
}: {
  entries: AuditEntry[];
  showRecord?: boolean;
}) => {
  const { data: staff } = useGetList<Staff>("sales", {
    pagination: { page: 1, perPage: 100 },
  });
  const { dealStages } = useConfigurationContext();
  // Deal stages are stored as codes; show the label people see on the board.
  const stageLabel = (value: string) =>
    dealStages.find((stage) => stage.value === value)?.label ?? value;
  if (!entries.length) return null;
  const who = (id: number | null) => {
    const person = staff?.find((s) => s.id === id);
    return person ? `${person.first_name} ${person.last_name}` : "System";
  };

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-3">
        <h6 className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-muted-foreground" /> History
        </h6>
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 pl-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {showRecord && recordLabels[entry.table_name]
                  ? `${recordLabels[entry.table_name]} · `
                  : null}
                {who(entry.actor_id)} ·{" "}
                {new Date(entry.changed_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {describe(entry, stageLabel).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};

export const AuditHistory = ({
  table,
  recordId,
}: {
  table: string;
  recordId: number | string;
}) => {
  const { data } = useGetList<AuditEntry>("audit_log", {
    filter: { table_name: table, record_id: recordId },
    sort: { field: "changed_at", order: "DESC" },
    pagination: { page: 1, perPage: 50 },
  });
  return <AuditEntryList entries={data ?? []} />;
};

// A contact's history: its own changes plus those of its deals and orders.
export const ContactActivity = ({
  contactId,
}: {
  contactId: number | string;
}) => {
  const { data } = useQuery({
    queryKey: ["contact_activity", String(contactId)],
    queryFn: async () => {
      const { data: rows, error } = await getSupabaseClient().rpc(
        "contact_activity",
        { p_contact_id: Number(contactId) },
      );
      if (error) throw error;
      return (rows ?? []) as AuditEntry[];
    },
  });
  return <AuditEntryList entries={data ?? []} showRecord />;
};
