import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { passwordProblem } from "./passwordRules";

// An administrator hands over a one-time password (no email is sent). At the first sign-in the
// person must replace it with one of their own before they can use the app.
export const PasswordGate = () => {
  const [needed, setNeeded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (live && data.user?.user_metadata?.must_change_password === true) {
          setNeeded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!needed) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    const { error: updateError } = await getSupabaseClient().auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setSaving(false);
    if (updateError) {
      setError(
        updateError.message || "That could not be saved. Please try again.",
      );
      return;
    }
    setNeeded(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <h1 className="text-xl font-semibold tracking-tight">
          Choose your own password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The password you were given is for one time only. Choose one that only
          you know.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Type it again</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </form>
    </div>
  );
};
