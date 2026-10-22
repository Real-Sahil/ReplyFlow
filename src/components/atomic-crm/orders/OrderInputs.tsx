import { required, useGetOne } from "ra-core";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { orderStatuses } from "./statuses";

// Money is stored in pence and edited in pounds.
const toPounds = (pence: number | null) => (pence == null ? "" : pence / 100);
// NumberInput types parse as returning a number, but an empty field must clear the value.
const toPence = (pounds: string) =>
  (pounds === "" ? null : Math.round(Number(pounds) * 100)) as number;

const money = (source: string, label: string) => (
  <NumberInput
    source={source}
    label={label}
    format={toPounds}
    parse={toPence}
    helperText={false}
  />
);

// Choosing a product fills in the summary and quoted price, but only while
// those fields are still empty so it never overwrites something typed by hand.
const FillFromProduct = () => {
  const { setValue, getValues } = useFormContext();
  const productId = useWatch({ name: "product_id" });
  const { data: product } = useGetOne(
    "products",
    { id: productId },
    { enabled: !!productId },
  );
  useEffect(() => {
    if (!product) return;
    if (!getValues("product_summary"))
      setValue("product_summary", product.title, { shouldDirty: true });
    if (getValues("quoted_price_pence") == null && product.price_pence != null)
      setValue("quoted_price_pence", product.price_pence, {
        shouldDirty: true,
      });
  }, [product, getValues, setValue]);
  return null;
};

export const OrderInputs = () => (
  <div className="flex flex-col gap-6 p-1">
    <FillFromProduct />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ReferenceInput source="contact_id" reference="contacts">
        <AutocompleteInput
          label="Customer"
          validate={required()}
          optionText={(c: { first_name: string; last_name: string }) =>
            c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : ""
          }
          helperText={false}
        />
      </ReferenceInput>
      <SelectInput
        source="status"
        choices={orderStatuses}
        defaultValue="quoted"
        validate={required()}
        helperText={false}
      />
      <ReferenceInput source="product_id" reference="products">
        <AutocompleteInput
          label="Product"
          optionText="title"
          helperText={false}
        />
      </ReferenceInput>
      <TextInput
        source="product_summary"
        label="What they are buying"
        helperText={false}
      />
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {money("quoted_price_pence", "Quoted (£)")}
      {money("agreed_price_pence", "Agreed (£)")}
      {money("deposit_required_pence", "Deposit due (£)")}
      {money("paid_pence", "Paid so far (£)")}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DateInput source="delivery_window_start" label="Delivery from" />
      <DateInput source="delivery_window_end" label="Delivery to" />
      <DateInput source="next_update_due" label="Next customer update due" />
    </div>
    <TextInput
      source="delivery_address"
      multiline
      rows={3}
      helperText={false}
    />
    <TextInput source="notes" multiline rows={4} helperText={false} />
  </div>
);
