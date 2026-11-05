import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { credentialsMessage } from "./credentialsMessage";

// Shown once, after a login is created or a password is reset. The password is not stored anywhere
// the administrator can read it again; a lost one is replaced with Reset password.
export const CredentialsDialog = ({
  name,
  email,
  password,
  business,
  onClose,
}: {
  name: string;
  // The business the login is for, when it is not the signed-in person's own (a platform owner setting one up).
  business?: string;
  email: string;
  password: string;
  onClose: () => void;
}) => {
  const { title } = useConfigurationContext();
  const [copied, setCopied] = useState(false);
  const message = credentialsMessage({
    name,
    business: business ?? title,
    // The app lives at /app; the root is the website.
    url: `${window.location.origin}/app`,
    email,
    password,
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign-in details for {name}</DialogTitle>
          <DialogDescription>
            Give these to {name} yourself. This is the only time the password is
            shown. Nothing has been emailed.
          </DialogDescription>
        </DialogHeader>
        <pre className="select-all whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
          {message}
        </pre>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Copied" : "Copy message"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
