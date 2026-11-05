import { Navigate, useLocation } from "react-router";

import { isClaimantPath, useIsClaimant } from "../misc/useIsClaimant";

// Keeps a staff sign-in on its own screens (expenses, hours and holiday). Everything else is empty for them anyway (the
// database refuses it); this just means they never land on a blank page.
export const ClaimantGuard = () => {
  const claimant = useIsClaimant();
  const { pathname } = useLocation();
  if (claimant && !isClaimantPath(pathname)) {
    return <Navigate to="/claims" replace />;
  }
  return null;
};
