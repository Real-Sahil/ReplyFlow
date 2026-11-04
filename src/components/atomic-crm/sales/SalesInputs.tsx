import { email, required, useGetIdentity, useRecordContext } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import type { Sale } from "../types";

export function SalesInputs() {
  const { identity } = useGetIdentity();
  const record = useRecordContext<Sale>();
  return (
    <div className="space-y-4 w-full">
      <TextInput source="first_name" validate={required()} helperText={false} />
      <TextInput source="last_name" validate={required()} helperText={false} />
      <TextInput
        source="email"
        validate={[required(), email()]}
        helperText={false}
      />
      <BooleanInput
        source="administrator"
        readOnly={record?.id === identity?.id}
        helperText={false}
      />
      <SelectInput
        source="role"
        label="Access"
        choices={[
          { id: "agent", name: "Team member" },
          {
            id: "accountant",
            name: "Accountant (reads the finance pages only)",
          },
          { id: "claimant", name: "Expenses only (sends expense claims)" },
        ]}
        format={(value: string | undefined) =>
          value === "accountant" || value === "claimant" ? value : "agent"
        }
        disabled={record?.id === identity?.id || !!record?.administrator}
        helperText="An accountant sees invoices, bills, the money book and reports, and cannot change anything. An expenses-only person can send expense claims and see how they went, and nothing else."
      />
      <BooleanInput
        source="disabled"
        readOnly={record?.id === identity?.id}
        helperText={false}
      />
    </div>
  );
}
