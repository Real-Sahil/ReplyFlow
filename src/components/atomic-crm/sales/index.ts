import type { Sale } from "../types";
import { lazyScreen } from "../root/lazyScreen";

export default {
  list: lazyScreen(() => import("./SalesList"), "SalesList"),
  create: lazyScreen(() => import("./SalesCreate"), "SalesCreate"),
  edit: lazyScreen(() => import("./SalesEdit"), "SalesEdit"),
  recordRepresentation: (record: Sale) =>
    `${record.first_name} ${record.last_name}`,
};
