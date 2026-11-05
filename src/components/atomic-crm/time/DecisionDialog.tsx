import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Asks for the reason a request is not approved, so the person can read it. Nothing is deleted.
export const DecisionDialog = ({
  title,
  description,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) => {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Why? For example: we need cover that week"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            Not approved
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
