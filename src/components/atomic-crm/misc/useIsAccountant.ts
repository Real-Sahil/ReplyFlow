import { useGetIdentity } from "ra-core";

// An accountant can read the finance pages of the business and change nothing. The database enforces
// that; this only tidies the screens so they do not offer buttons that would be refused.
export const useIsAccountant = () => {
  const { identity } = useGetIdentity();
  return (identity as { role?: string } | undefined)?.role === "accountant";
};

// The only places an accountant is taken to. Anything else sends them to the accountant's pack.
export const ACCOUNTANT_PATHS = [
  "/owed",
  "/invoices",
  "/bills",
  "/money",
  "/reports",
  "/accountant",
  "/profile",
];
export const isAccountantPath = (pathname: string) =>
  ACCOUNTANT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
