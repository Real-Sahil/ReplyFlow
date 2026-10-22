import { EditBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { OrderInputs } from "./OrderInputs";

export const OrderEdit = () => (
  <EditBase
    actions={false}
    redirect="list"
    // reference and balance_pence are generated columns the database refuses to write.
    transform={({
      reference,
      balance_pence,
      created_at,
      updated_at,
      ...rest
    }) => rest}
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
  </EditBase>
);
