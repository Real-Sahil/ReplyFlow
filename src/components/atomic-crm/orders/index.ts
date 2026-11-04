import { lazyScreen } from "../root/lazyScreen";

export default {
  list: lazyScreen(() => import("./OrderList"), "OrderList"),
  create: lazyScreen(() => import("./OrderCreate"), "OrderCreate"),
  edit: lazyScreen(() => import("./OrderEdit"), "OrderEdit"),
};
