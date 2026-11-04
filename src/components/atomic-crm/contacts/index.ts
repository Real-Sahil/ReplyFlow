import type { Contact } from "../types";
import { lazyScreen } from "../root/lazyScreen";

export default {
  list: lazyScreen(() => import("./ContactList"), "ContactList"),
  show: lazyScreen(() => import("./ContactShow"), "ContactShow"),
  edit: lazyScreen(() => import("./ContactEdit"), "ContactEdit"),
  create: lazyScreen(() => import("./ContactCreate"), "ContactCreate"),
  recordRepresentation: (record: Contact) =>
    record?.first_name + " " + record?.last_name,
};
