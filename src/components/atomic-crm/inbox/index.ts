import { lazyScreen } from "../root/lazyScreen";

export default { list: lazyScreen(() => import("./InboxList"), "InboxList") };
