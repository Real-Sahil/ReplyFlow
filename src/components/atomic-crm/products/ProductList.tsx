import { ExportDialogButton } from "../exports/ExportDialog";
import { productsExport } from "../exports/exportConfigs";
import {
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useRecordContext,
} from "ra-core";
import { Link } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatPrice } from "./formatPrice";

type Product = {
  id: number;
  reference: string;
  title: string;
  collection: string | null;
  colour: string | null;
  price_pence: number | null;
  original_price_pence: number | null;
  image_url: string | null;
  active: boolean;
};

const filters = [<SearchInput source="q" alwaysOn key="q" />];

export const ProductList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={24}
      sort={{ field: "collection", order: "ASC" }}
      filters={filters}
      actions={
        <TopToolbar>
          <ExportDialogButton config={productsExport()} />
          <CreateButton label="New product" />
        </TopToolbar>
      }
      pagination={<ListPagination rowsPerPageOptions={[12, 24, 48, 100]} />}
    >
      <ProductGrid />
    </List>
  );
};

const ProductGrid = () => {
  const { data, isPending } = useListContext<Product>();
  if (isPending) return null;
  if (!data?.length) return <div className="p-2">No products found</div>;
  return (
    <div
      className="w-full gap-3 grid"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {data.map((record) => (
        <RecordContextProvider key={record.id} value={record}>
          <ProductCard />
        </RecordContextProvider>
      ))}
    </div>
  );
};

const ProductCard = () => {
  const record = useRecordContext<Product>();
  const { currency } = useConfigurationContext();
  if (!record) return null;
  return (
    <Link to={`/products/${record.id}`} className="block">
      <Card className="h-full overflow-hidden gap-0 py-0 hover:shadow-md transition-shadow">
        <div className="aspect-4/3 bg-muted">
          {record.image_url ? (
            <img
              src={record.image_url}
              alt={record.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{record.collection}</span>
            {!record.active && <Badge variant="secondary">Not available</Badge>}
          </div>
          <div className="text-sm font-medium line-clamp-2">{record.title}</div>
          <div className="text-xs text-muted-foreground">
            {record.reference}
            {record.colour ? ` · ${record.colour}` : ""}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold">
              {formatPrice(record.price_pence, currency)}
            </span>
            {record.original_price_pence != null &&
              record.original_price_pence !== record.price_pence && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(record.original_price_pence, currency)}
                </span>
              )}
          </div>
        </div>
      </Card>
    </Link>
  );
};
