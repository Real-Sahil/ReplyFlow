import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useNotify } from "ra-core";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";

type Note = {
  id: number;
  body: string;
  sales_id: number | null;
  created_at: string;
};

// Notes the team keeps on a conversation. They are never sent to the customer.
export const InternalNotes = ({ contactId }: { contactId: number }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["internal_notes", contactId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("messenger_internal_notes")
        .select("id, body, sales_id, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const add = async () => {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    const { error } = await getSupabaseClient()
      .from("messenger_internal_notes")
      .insert({
        contact_id: contactId,
        body: text,
        sales_id: Number(identity?.id) || null,
      });
    setSaving(false);
    if (error) {
      notify("The note could not be saved", { type: "error" });
      return;
    }
    setBody("");
    void queryClient.invalidateQueries({
      queryKey: ["internal_notes", contactId],
    });
  };

  return (
    <section className="mt-4 flex flex-col gap-3 border-t pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="size-4 text-muted-foreground" /> Internal notes
        <span className="font-normal text-muted-foreground">
          (never sent to the customer)
        </span>
      </h3>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md bg-muted/40 p-2">
              <p className="whitespace-pre-line break-words">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(note.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        aria-label="Internal note"
        rows={2}
        value={body}
        maxLength={2000}
        placeholder="Write a note for the team"
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!body.trim() || saving}
        >
          {saving ? "Saving…" : "Add note"}
        </Button>
      </div>
    </section>
  );
};
