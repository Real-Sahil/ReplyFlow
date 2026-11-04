import { lazyScreen } from "../root/lazyScreen";

const screens = () => import("./SavedReplyScreens");

export default {
  list: lazyScreen(screens, "SavedReplyList"),
  create: lazyScreen(screens, "SavedReplyCreate"),
  edit: lazyScreen(screens, "SavedReplyEdit"),
};
