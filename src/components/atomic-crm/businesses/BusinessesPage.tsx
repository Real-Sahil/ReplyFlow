import { useState } from "react";
import { Building2 } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CredentialsDialog } from "../sales/CredentialsDialog";
import {
  useBusinessList,
  useCreateBusiness,
  useIsPlatformOwner,
  type CreatedBusiness,
} from "./useBusinesses";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// For the platform owner only: set up a customer's business and its first administrator. Sign-up is closed, so
// this is how a business is added. The new administrator gets a one-time password (shown once, here) and must
// choose their own at first sign-in. No email is sent.
export const BusinessesPage = () => {
  const owner = useIsPlatformOwner();
  const list = useBusinessList(owner);
  const create = useCreateBusiness();
  const notify = useNotify();
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<CreatedBusiness | null>(null);

  if (!owner) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only the platform owner can set up businesses.
      </p>
    );
  }
  const valid =
    name.trim().length >= 2 &&
    first.trim() &&
    last.trim() &&
    EMAIL.test(email.trim());
  const submit = () =>
    create.mutate(
      { organisation_name: name, first_name: first, last_name: last, email },
      {
        onSuccess: (business) => {
          setCreated(business);
          setName("");
          setFirst("");
          setLast("");
          setEmail("");
        },
        onError: (error: Error) => notify(error.message, { type: "error" }),
      },
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Building2 className="size-6 text-muted-foreground" /> Businesses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a customer's business and its first administrator. They get a
          one-time password to pass on and choose their own at first sign-in.
          Nothing is emailed.
        </p>
      </div>

      <form
        className="grid gap-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="biz-name">Business name</Label>
          <Input
            id="biz-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="biz-first">Administrator's first name</Label>
          <Input
            id="biz-first"
            value={first}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setFirst(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="biz-last">Last name</Label>
          <Input
            id="biz-last"
            value={last}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setLast(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="biz-email">Their email (their sign-in)</Label>
          <Input
            id="biz-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? "Setting up…" : "Set up the business"}
          </Button>
        </div>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          On the platform
        </h2>
        {list.isError ? (
          <p className="text-sm text-muted-foreground">
            This could not be loaded. Please try again.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            {(list.data ?? []).map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm last:border-b-0"
              >
                <span>
                  <span className="font-medium">{b.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.administrators.join(", ") || "No administrator"} ·{" "}
                    {b.people} {b.people === 1 ? "person" : "people"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Since {day(b.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {created ? (
        <CredentialsDialog
          name={`${created.first_name} ${created.last_name}`}
          business={created.organisation_name}
          email={created.email}
          password={created.temporary_password}
          onClose={() => setCreated(null)}
        />
      ) : null}
    </div>
  );
};

export default BusinessesPage;
