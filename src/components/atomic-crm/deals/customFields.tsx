import { useWatch } from "react-hook-form";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { useCustomFieldDefinitions } from "./customFieldDefinitions";

// Form inputs for the fields of whichever category the deal currently has.
export const CustomFieldInputs = () => {
  const category = useWatch({ name: "category" }) as string | undefined;
  const { data } = useCustomFieldDefinitions(category);
  if (!data?.length) return null;
  return (
    <>
      {data.map((def) => {
        const source = `custom_fields.${def.field_key}`;
        switch (def.field_type) {
          case "number":
            return (
              <NumberInput
                key={def.id}
                source={source}
                label={def.label}
                helperText={false}
              />
            );
          case "date":
            return (
              <DateInput
                key={def.id}
                source={source}
                label={def.label}
                helperText={false}
              />
            );
          case "select":
            return (
              <SelectInput
                key={def.id}
                source={source}
                label={def.label}
                choices={def.options.map((option) => ({
                  id: option,
                  name: option,
                }))}
                helperText={false}
              />
            );
          case "text":
            return (
              <TextInput
                key={def.id}
                source={source}
                label={def.label}
                helperText={false}
              />
            );
        }
      })}
    </>
  );
};

// Read-only values for the deal view, in the order the category defines them.
export const CustomFieldValues = ({
  category,
  values,
}: {
  category?: string;
  values?: Record<string, unknown> | null;
}) => {
  const { data } = useCustomFieldDefinitions(category);
  const filled = (data ?? []).filter((def) => {
    const value = values?.[def.field_key];
    return value !== null && value !== undefined && value !== "";
  });
  if (!filled.length) return null;
  return (
    <>
      {filled.map((def) => (
        <div key={def.id} className="mr-10 flex flex-col">
          <span className="text-xs tracking-wide text-muted-foreground">
            {def.label}
          </span>
          <span className="text-sm">{String(values?.[def.field_key])}</span>
        </div>
      ))}
    </>
  );
};
