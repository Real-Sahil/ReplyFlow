import { CreateBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { ProductInputs } from "./ProductInputs";

export const ProductCreate = () => (
  <CreateBase
    redirect="list"
    transform={(values) => ({
      ...values,
      images: values.image_url ? [values.image_url] : [],
    })}
  >
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
  </CreateBase>
);
