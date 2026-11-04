import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  CanAccess,
  Navigate,
  useDataProvider,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { getSalesErrorNotification } from "./salesErrorNotification";
import { CredentialsDialog } from "./CredentialsDialog";
import { SalesInputs } from "./SalesInputs";

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: (sale) => {
      // No email is sent. The one-time password is shown once, for the administrator to hand over.
      const password = (sale as { temporary_password?: string })
        .temporary_password;
      if (password) {
        setCreated({
          name: `${sale.first_name} ${sale.last_name}`.trim(),
          email: sale.email,
          password,
        });
        return;
      }
      notify("User created.");
      redirect("/sales");
    },
    onError: (error) => {
      const { message, args } = getSalesErrorNotification(
        error,
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
      );
      notify(message, { type: "error", messageArgs: args });
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <CanAccess
      resource="sales"
      action="create"
      accessDenied={<Navigate to="/access-denied" />}
    >
      {created ? (
        <CredentialsDialog
          {...created}
          onClose={() => {
            setCreated(null);
            redirect("/sales");
          }}
        />
      ) : null}
      <div className="max-w-lg w-full mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("resources.sales.create.title", {
                _: "Create a new user",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
              <SalesInputs />
            </SimpleForm>
          </CardContent>
        </Card>
      </div>
    </CanAccess>
  );
}
