import { getSupabaseClient } from "../providers/supabase/supabase";

// Sends a Messenger message to a contact through the messenger_send function. Throws
// with the server's own message when Messenger will not deliver it (for example, the
// 24-hour window has closed).
export const send = async (
  contactId: number,
  payload: { text?: string; product_id?: number },
) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "messenger_send",
    { method: "POST", body: { contact_id: contactId, ...payload } },
  );
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(details.message || "Could not send the message");
  }
  return data;
};
