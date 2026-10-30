import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

// Browser side of push notifications. The server holds the signing key and sends the
// notifications; this only asks permission and registers this device.

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const toKey = (base64Url: string) => {
  const padded = base64Url.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const currentSubscription = async () => {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

export const enablePush = async () => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const registration = await navigator.serviceWorker.ready;
  const client = getSupabaseClient();
  const { data: key, error: keyError } = await client.functions.invoke<{
    data: { publicKey: string };
  }>("push_subscribe", { method: "GET" });
  if (keyError || !key?.data?.publicKey) throw new Error("Could not start notifications");
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(key.data.publicKey),
    }));
  const { error } = await client.functions.invoke("push_subscribe", {
    method: "POST",
    body: { subscription: subscription.toJSON() },
  });
  if (error) throw new Error("Could not save this device");
  return permission;
};

export const disablePush = async () => {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await getSupabaseClient().functions.invoke("push_subscribe", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
};
