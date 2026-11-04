import { lazyScreen } from "../root/lazyScreen";

const screens = () => import("./PostScreens");

export default {
  list: lazyScreen(screens, "PostList"),
  create: lazyScreen(screens, "PostCreate"),
  edit: lazyScreen(screens, "PostEdit"),
};
