import { lazyScreen } from "../root/lazyScreen";

export default {
  edit: lazyScreen(
    () => import("./MessengerSettingsEdit"),
    "MessengerSettingsEdit",
  ),
};
