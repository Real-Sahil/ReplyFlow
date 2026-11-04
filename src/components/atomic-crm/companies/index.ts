import { lazyScreen } from "../root/lazyScreen";

export default {
  list: lazyScreen(() => import("./CompanyList"), "CompanyList"),
  create: lazyScreen(() => import("./CompanyCreate"), "CompanyCreate"),
  edit: lazyScreen(() => import("./CompanyEdit"), "CompanyEdit"),
  show: lazyScreen(() => import("./CompanyShow"), "CompanyShow"),
};
