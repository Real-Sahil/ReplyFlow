import { useRecordContext, useNotify } from "ra-core";
import { Copy, ExternalLink } from "lucide-react";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { orderStatusLabel } from "./statuses";

// Stages a customer can see, in order. Quoted orders are not shown to the customer.
export const TRACKED_STAGES = [
  "confirmed",
  "deposit_paid",
  "in_production",
  "ready_for_delivery",
  "delivery_booked",
  "delivered",
  "completed",
] as const;

const LIGHT_CHOICES = [
  { id: "", name: "Not set" },
  { id: "green", name: "Green: on track" },
  { id: "amber", name: "Amber: needs attention" },
  { id: "red", name: "Red: delayed" },
];

// The address the customer receives. Shared with the page, so it is built from the
// same project address the app already uses.
export const customerPageUrl = (token: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order_tracking?token=${encodeURIComponent(token)}`;

// Saved with the order. Empty lights are removed before saving (see OrderEdit), so the
// database only ever sees green, amber or red.
export const CustomerPage = () => {
  const record = useRecordContext<{
    tracking_token?: string;
    status: string;
  }>();
  const notify = useNotify();
  if (!record?.tracking_token) return null;
  const link = customerPageUrl(record.tracking_token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      notify("Customer link copied");
    } catch {
      notify("Could not copy. Select the link and copy it by hand.", {
        type: "warning",
      });
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <Separator />
      <div>
        <h3 className="text-base font-semibold">Customer page</h3>
        <p className="text-sm text-muted-foreground">
          Send this link once the order is confirmed. Anyone with the link can
          see the stages below, so keep it to the customer. Status is{" "}
          {orderStatusLabel(record.status)}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">
          {link}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy /> Copy link
        </Button>
        <Button asChild type="button" variant="ghost" size="sm">
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TRACKED_STAGES.map((stage) => (
          <SelectInput
            key={stage}
            source={`stage_lights.${stage}`}
            label={stage.replace(/_/g, " ")}
            choices={LIGHT_CHOICES}
            helperText={false}
          />
        ))}
      </div>

      <TextInput
        source="customer_update"
        label="Update for the customer"
        multiline
        rows={3}
        helperText="Shown on the customer's page. Plain text, written for the customer."
      />
    </section>
  );
};
