import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ExportDialogButton } from "../exports/ExportDialog";
import { ordersExport } from "../exports/exportConfigs";
import { useGetIdentity, useRecordContext } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectInput } from "@/components/admin/select-input";
import { Badge } from "@/components/ui/badge";

import { formatPrice } from "../products/formatPrice";
import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { cn } from "@/lib/utils";

import { orderStatusTone } from "./statusTone";
import { orderStatuses, orderStatusLabel } from "./statuses";

type Order = {
  status: string;
  agreed_price_pence: number | null;
  quoted_price_pence: number | null;
  balance_pence: number | null;
  next_update_due: string | null;
};

const filters = [
  <SelectInput
    source="status"
    choices={orderStatuses}
    alwaysOn
    emptyText="All statuses"
    key="status"
    helperText={false}
  />,
];

const StatusBadge = () => {
  const record = useRecordContext<Order>();
  if (!record) return null;
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", orderStatusTone[record.status])}
    >
      {orderStatusLabel(record.status)}
    </Badge>
  );
};

const Money = ({ field }: { field: keyof Order }) => {
  const record = useRecordContext<Order>();
  const { currency } = useConfigurationContext();
  if (!record) return null;
  return <>{formatPrice(record[field] as number | null, currency)}</>;
};

const ContactName = () => {
  const record = useRecordContext<{ first_name: string; last_name: string }>();
  return record ? (
    <>{`${record.first_name} ${record.last_name ?? ""}`}</>
  ) : null;
};

export const OrderList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      sort={{ field: "id", order: "DESC" }}
      filters={filters}
      actions={
        <TopToolbar>
          <Button asChild variant="outline" size="sm">
            <Link to="/accounts">Account</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/transactions">Transactions</Link>
          </Button>
          <ExportDialogButton config={ordersExport()} />
          <CreateButton label="New order" />
        </TopToolbar>
      }
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50]} />}
    >
      <DataTable bulkActionButtons={false} rowClick="edit">
        <DataTable.Col source="reference" label="Order" />
        <DataTable.Col source="contact_id" label="Customer">
          <ReferenceField source="contact_id" reference="contacts" link={false}>
            <ContactName />
          </ReferenceField>
        </DataTable.Col>
        <DataTable.Col source="product_summary" label="Item" />
        <DataTable.Col source="status" label="Status">
          <StatusBadge />
        </DataTable.Col>
        <DataTable.Col source="agreed_price_pence" label="Price">
          <Money field="agreed_price_pence" />
        </DataTable.Col>
        <DataTable.Col source="balance_pence" label="Balance">
          <Money field="balance_pence" />
        </DataTable.Col>
        <DataTable.Col source="next_update_due" label="Update due" />
      </DataTable>
    </List>
  );
};
