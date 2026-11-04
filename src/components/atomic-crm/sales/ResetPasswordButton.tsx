import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
  useRecordContext,
} from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CrmDataProvider } from "../providers/types";
import type { Sale } from "../types";
import { CredentialsDialog } from "./CredentialsDialog";

// Gives someone a new one-time password, to hand over in person. Their old password stops working.
export const ResetPasswordButton = () => {
  const record = useRecordContext<Sale>();
  const { identity } = useGetIdentity();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: async () => dataProvider.salesResetPassword(record!.id),
    onSuccess: (newPassword) => {
      setConfirming(false);
      setPassword(newPassword);
    },
    onError: (error: Error) =>
      notify(error.message || "The password could not be reset.", {
        type: "error",
      }),
  });

  // Your own password is changed from your profile.
  if (!record || record.id === identity?.id) return null;
  const name = `${record.first_name} ${record.last_name}`.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setConfirming(true)}
      >
        <KeyRound className="size-4" /> Reset password
      </Button>
      {confirming ? (
        <Dialog open onOpenChange={(open) => !open && setConfirming(false)}>
          <DialogContent className="p-5 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset {name}'s password?</DialogTitle>
              <DialogDescription>
                Their current password stops working. You will get a new
                one-time password to give them yourself.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button disabled={reset.isPending} onClick={() => reset.mutate()}>
                Reset password
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {password ? (
        <CredentialsDialog
          name={name}
          email={record.email}
          password={password}
          onClose={() => setPassword(null)}
        />
      ) : null}
    </>
  );
};
