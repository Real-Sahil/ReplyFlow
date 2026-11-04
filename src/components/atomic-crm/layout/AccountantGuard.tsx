import { Navigate, useLocation } from "react-router";

import { isAccountantPath, useIsAccountant } from "../misc/useIsAccountant";

// Keeps an accountant on the finance pages. Everything else is empty for them anyway (the database
// refuses it); this just means they never land on a blank customer screen.
export const AccountantGuard = () => {
  const accountant = useIsAccountant();
  const { pathname } = useLocation();
  if (accountant && !isAccountantPath(pathname)) {
    return <Navigate to="/accountant" replace />;
  }
  return null;
};
