import { EditBase, Form, useRecordContext } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { AuditHistory } from "../audit/AuditHistory";
import { FormToolbar } from "../layout/FormToolbar";
import { ProductInputs } from "./ProductInputs";

const ProductHistory = () => {
  const record = useRecordContext();
  return record ? <AuditHistory table="products" recordId={record.id} /> : null;
};

export const ProductEdit = () => (
  <EditBase actions={false} redirect="list">
    <div className="mt-2 flex lg:mr-72">
      <Form className="flex flex-1 flex-col gap-4 pb-2">
        <Card>
          <CardContent>
            <ProductInputs />
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>
    </div>
    <ProductHistory />
  </EditBase>
);
