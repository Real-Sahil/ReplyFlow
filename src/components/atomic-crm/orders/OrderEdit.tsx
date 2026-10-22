import { EditBase, Form, useRecordContext } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { AuditHistory } from "../audit/AuditHistory";
import { FormToolbar } from "../layout/FormToolbar";
import { OrderInputs } from "./OrderInputs";

const OrderHistory = () => {
  const record = useRecordContext();
  return record ? <AuditHistory table="orders" recordId={record.id} /> : null;
};

export const OrderEdit = () => (
  <EditBase
    actions={false}
    redirect="list"
    // reference and balance_pence are generated columns the database refuses to write.
    transform={(values) => {
      const rest = { ...values };
      for (const key of [
        "reference",
        "balance_pence",
        "created_at",
        "updated_at",
      ])
        delete rest[key];
      return rest;
    }}
  >
    <div className="mt-2 flex">
      <Form className="flex flex-1 flex-col gap-4 pb-2">
        <Card>
          <CardContent>
            <OrderInputs />
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>
    </div>
    <OrderHistory />
  </EditBase>
);
