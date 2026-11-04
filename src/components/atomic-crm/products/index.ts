import { lazyScreen } from "../root/lazyScreen";

export default {
  list: lazyScreen(() => import("./ProductList"), "ProductList"),
  create: lazyScreen(() => import("./ProductCreate"), "ProductCreate"),
  edit: lazyScreen(() => import("./ProductEdit"), "ProductEdit"),
};
