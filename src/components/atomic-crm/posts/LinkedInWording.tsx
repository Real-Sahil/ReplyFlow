import { useState } from "react";
import { useNotify } from "ra-core";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { AiWriting } from "./AiWriting";
import type { Wording } from "./destinations";

// What reads well on LinkedIn; the server allows up to 3,000.
const COMFORTABLE = 1300;

// The words for the LinkedIn destinations of a post: the post as written, or one LinkedIn version (from the AI
// writer, editable) used for all of them. The version is saved with the post and so is part of what gets approved.
export const LinkedInWording = ({
  value,
  onChange,
  postMessage,
  productId,
  locked,
  name,
}: {
  value: Wording;
  onChange: (next: Wording) => void;
  postMessage: string;
  productId: number | null;
  // Once a post is approved only an administrator may change a version.
  locked?: boolean;
  name: string;
}) => {
  const notify = useNotify();
  const [writing, setWriting] = useState(false);

  const write = async () => {
    if (!postMessage.trim()) {
      notify("Write the post first, then the AI writer can rewrite it.", {
        type: "warning",
      });
      return;
    }
    setWriting(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      data: { message: string };
    }>("post_autopilot", {
      method: "POST",
      body: {
        channel: "linkedin",
        message: postMessage,
        product_id: productId,
      },
    });
    setWriting(false);
    if (error) {
      const body = (await error.context?.json?.().catch(() => ({}))) as
        | { message?: string }
        | undefined;
      notify(body?.message ?? "The AI writer could not write this one", {
        type: "error",
      });
      return;
    }
    onChange({ mode: "linkedin", text: data?.data?.message ?? "" });
  };

  const choose = (mode: Wording["mode"]) => {
    onChange({ ...value, mode });
    if (mode === "linkedin" && !value.text) void write();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`wording-${name}`}
            checked={value.mode === "written"}
            disabled={locked}
            onChange={() => choose("written")}
          />
          The post as written
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`wording-${name}`}
            checked={value.mode === "linkedin"}
            disabled={locked}
            onChange={() => choose("linkedin")}
          />
          A LinkedIn version
        </label>
      </div>
      {value.mode === "linkedin" ? (
        writing ? (
          <p className="text-sm text-muted-foreground">
            <AiWriting label="Writing the LinkedIn version…" />
          </p>
        ) : (
          <>
            <Textarea
              aria-label="LinkedIn version"
              rows={6}
              value={value.text}
              disabled={locked}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  value.text.length > COMFORTABLE
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {value.text.length.toLocaleString("en-GB")} characters
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={locked}
                onClick={() => void write()}
              >
                <Sparkles /> Write with AI
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!value.text}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(value.text)
                    .then(() => notify("Copied"))
                    .catch(() =>
                      notify("Could not copy. Select the text by hand.", {
                        type: "warning",
                      }),
                    );
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
            {locked ? (
              <p className="text-xs text-muted-foreground">
                This post is approved, so only an administrator can change the
                LinkedIn version.
              </p>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
};
