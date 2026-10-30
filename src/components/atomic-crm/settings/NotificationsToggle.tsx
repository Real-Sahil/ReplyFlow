import { useEffect, useState } from "react";
import { useNotify } from "ra-core";

import { Switch } from "@/components/ui/switch";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupported,
} from "@/lib/push";

// One switch: tell this phone or computer when a customer messages. On an iPhone it only
// works once the app has been added to the Home Screen.
export const NotificationsToggle = () => {
  const notify = useNotify();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();
  const denied = supported && Notification.permission === "denied";

  useEffect(() => {
    if (!supported) return;
    currentSubscription()
      .then((s) => setOn(!!s && Notification.permission === "granted"))
      .catch(() => {});
  }, [supported]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const result = await enablePush();
        setOn(result === "granted");
        if (result !== "granted")
          notify("Notifications were not allowed on this device", {
            type: "warning",
          });
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-base font-medium">Message notifications</p>
        <p className="text-sm text-muted-foreground">
          {!supported
            ? "On iPhone, add ReplyFlow to your Home Screen first, then open it from there."
            : denied
              ? "Blocked for this site. Allow notifications in your browser settings."
              : "Tell this device when a customer writes."}
        </p>
      </div>
      <Switch
        checked={on}
        disabled={!supported || denied || busy}
        onCheckedChange={toggle}
        aria-label="Message notifications"
      />
    </div>
  );
};
