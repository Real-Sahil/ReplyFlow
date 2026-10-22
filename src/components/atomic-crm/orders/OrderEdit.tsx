import { EditBase, Form, useRecordContext } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { AuditHistory } from "../audit/AuditHistory";
import { FormToolbar } from "../layout/FormToolbar";
import { CustomerPage } from "./CustomerPage";
import { OrderInputs } from "./OrderInputs";
import { OrderPayments } from "./OrderPayments";

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
        "tracking_token",
        // Worked out from the payment rows; a stale copy must never overwrite it.
        "paid_pence",
      ])
        delete rest[key];
      // An empty light means "not set": drop it rather than store a blank.
      if (rest.stage_lights) {
        rest.stage_lights = Object.fromEntries(
          Object.entries(rest.stage_lights).filter(([, light]) => !!light),
        );
      }
      return rest;
    }}
  >
    <div className="mt-2 flex">
      <Form className="flex flex-1 flex-col gap-4 pb-2">
        <Card>
          <CardContent>
            <OrderInputs />
            <CustomerPage />
            <OrderPayments />
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>
    </div>
    <OrderHistory />
  </EditBase>
);
