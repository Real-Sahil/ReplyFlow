import { useEffect, useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { getSupabaseClient } from "../providers/supabase/supabase";

type Settings = {
  enabled: boolean;
  auto_approve: boolean;
  posts_per_day: number;
  slot_times: string[];
};

const SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const parseSlots = (text: string): string[] | null => {
  const slots = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (slots.length === 0 || slots.some((s) => !SLOT_PATTERN.test(s))) {
    return null;
  }
  return [...new Set(slots)].sort();
};

// Turns the AI writer on or off and sets how many posts it may queue per day.
// Anything it queues still waits for an administrator to approve.
export const AutopilotPanel = () => {
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as { administrator?: boolean } | undefined)
    ?.administrator;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [perDay, setPerDay] = useState("2");
  const [slots, setSlots] = useState("12:00, 18:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSupabaseClient()
      .from("post_autopilot_settings")
      .select("enabled, auto_approve, posts_per_day, slot_times")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSettings(data as Settings);
        setPerDay(String(data.posts_per_day));
        setSlots((data.slot_times as string[]).join(", "));
      });
  }, []);

  const save = async (patch: Partial<Settings>) => {
    setBusy(true);
    const { error } = await getSupabaseClient()
      .from("post_autopilot_settings")
      .update(patch)
      .eq("id", 1);
    setBusy(false);
    if (error) {
      notify("Could not save the autopilot settings", { type: "error" });
      return false;
    }
    setSettings((current) => (current ? { ...current, ...patch } : current));
    return true;
  };

  const toggle = async (enabled: boolean) => {
    if (await save({ enabled })) {
      notify(enabled ? "AI writer is on" : "AI writer is off");
    }
  };

  // With this on, posts the writer plans go to Facebook on their slot without a
  // review step. Turn it off to go back to approving each one.
  const toggleAutoApprove = async (auto_approve: boolean) => {
    if (await save({ auto_approve })) {
      notify(
        auto_approve
          ? "Auto-approval is on: planned posts will go out on their slots"
          : "Auto-approval is off: posts wait for review",
      );
    }
  };

  const saveLimits = async () => {
    const count = Number(perDay);
    const times = parseSlots(slots);
    if (!Number.isInteger(count) || count < 0 || count > 10) {
      notify("Choose between 0 and 10 posts a day.", { type: "error" });
      return;
    }
    if (!times) {
      notify("Post times must look like 12:00, 18:00.", { type: "error" });
      return;
    }
    if (await save({ posts_per_day: count, slot_times: times })) {
      notify("Autopilot settings saved");
    }
  };

  if (!settings) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4" /> AI writer
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            Writes a caption for each new product with a photo and plans it in
            the next free slot. Nothing goes out until an administrator approves
            it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={settings.enabled}
              disabled={!isAdmin || busy}
              onCheckedChange={(checked) => void toggle(checked)}
            />
            {settings.enabled ? "On" : "Off"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={settings.auto_approve}
              disabled={!isAdmin || busy || !settings.enabled}
              onCheckedChange={(checked) => void toggleAutoApprove(checked)}
            />
            Auto-approve
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Posts a day
            <Input
              type="number"
              min={0}
              max={10}
              className="w-24"
              value={perDay}
              disabled={!isAdmin}
              onChange={(event) => setPerDay(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Post times (UK)
            <Input
              className="w-48"
              value={slots}
              disabled={!isAdmin}
              onChange={(event) => setSlots(event.target.value)}
              placeholder="12:00, 18:00"
            />
          </label>
          {isAdmin && (
            <Button variant="outline" disabled={busy} onClick={saveLimits}>
              Save
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
