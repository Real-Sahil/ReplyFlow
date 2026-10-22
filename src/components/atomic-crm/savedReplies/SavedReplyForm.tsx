import { required } from "ra-core";
import { TextInput } from "@/components/admin/text-input";

export const SavedReplyInputs = () => (
  <div className="flex flex-col gap-4 p-1">
    <TextInput source="title" validate={required()} helperText={false} />
    <TextInput
      source="body"
      label="Message"
      multiline
      rows={5}
      validate={required()}
      helperText="Use {{first_name}} to insert the customer's first name."
    />
  </div>
);
