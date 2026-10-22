import { CreateBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { OrderInputs } from "./OrderInputs";

export const OrderCreate = () => (
  <CreateBase redirect="list">
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
  </CreateBase>
);
