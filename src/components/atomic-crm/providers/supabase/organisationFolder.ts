import { getSupabaseClient } from "./supabase";

// Storage keeps each organisation's files in its own folder: <organisation_id>/<file>.
// The database decides the organisation (my_organisation_id), so a client cannot pick
// another organisation's folder: the storage policies refuse it.
export const storagePath = async (fileName: string) => {
  const { data, error } = await getSupabaseClient().rpc("my_organisation_id");
  if (error || data == null) {
    throw new Error("Could not find your organisation for the upload");
  }
  return `${data}/${fileName}`;
};
