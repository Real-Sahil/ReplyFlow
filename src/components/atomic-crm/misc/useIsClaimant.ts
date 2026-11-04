import { useGetIdentity } from "ra-core";

// An expenses-only sign-in can send expense claims and see how they went, and nothing else. The
// database enforces that; this only keeps such a person on their one screen.
export const useIsClaimant = () => {
  const { identity } = useGetIdentity();
  return (identity as { role?: string } | undefined)?.role === "claimant";
};

export const CLAIMANT_PATHS = ["/claims", "/profile"];
export const isClaimantPath = (pathname: string) =>
  CLAIMANT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
