import { required } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { NumberInput } from "@/components/admin/number-input";
import { TextInput } from "@/components/admin/text-input";

// Prices are stored in pence and edited in pounds.
const toPounds = (pence: number | null) => (pence == null ? "" : pence / 100);
// NumberInput types parse as returning a number, but an empty field must clear the price.
const toPence = (pounds: string) =>
  (pounds === "" ? null : Math.round(Number(pounds) * 100)) as number;

export const ProductInputs = () => (
  <div className="flex flex-col gap-4 p-1">
    <TextInput source="title" validate={required()} helperText={false} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TextInput source="reference" validate={required()} helperText={false} />
      <TextInput source="collection" helperText={false} />
      <TextInput source="product_type" label="Type" helperText={false} />
      <TextInput source="colour" helperText={false} />
      <NumberInput
        source="price_pence"
        label="Price (£)"
        format={toPounds}
        parse={toPence}
        helperText={false}
      />
      <NumberInput
        source="original_price_pence"
        label="Original price (£)"
        format={toPounds}
        parse={toPence}
        helperText={false}
      />
    </div>
    <TextInput source="description" multiline rows={6} helperText={false} />
    <TextInput source="image_url" label="Image URL" helperText={false} />
    <BooleanInput source="active" label="Available to sell" defaultValue />
  </div>
);
