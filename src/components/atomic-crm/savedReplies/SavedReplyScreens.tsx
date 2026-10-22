import { CreateBase, EditBase, Form, useGetIdentity } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { TopToolbar } from "../layout/TopToolbar";
import { SavedReplyInputs } from "./SavedReplyForm";

export const SavedReplyList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={50}
      sort={{ field: "title", order: "ASC" }}
      actions={
        <TopToolbar>
          <CreateButton label="New saved reply" />
        </TopToolbar>
      }
      pagination={false}
    >
      <DataTable bulkActionButtons={false} rowClick="edit">
        <DataTable.Col source="title" />
        <DataTable.Col source="body" label="Message" />
      </DataTable>
    </List>
  );
};

const SavedReplyForm = () => (
  <Form className="flex flex-1 flex-col gap-4 pb-2">
    <Card>
      <CardContent>
        <SavedReplyInputs />
        <FormToolbar />
      </CardContent>
    </Card>
  </Form>
);

export const SavedReplyCreate = () => (
  <CreateBase redirect="list">
    <div className="mt-2 flex">
      <SavedReplyForm />
    </div>
  </CreateBase>
);

export const SavedReplyEdit = () => (
  <EditBase actions={false} redirect="list">
    <div className="mt-2 flex">
      <SavedReplyForm />
    </div>
  </EditBase>
);
