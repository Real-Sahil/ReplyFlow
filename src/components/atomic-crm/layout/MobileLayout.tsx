import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { useIsAccountant } from "../misc/useIsAccountant";
import { useIsClaimant } from "../misc/useIsClaimant";
import { AccountantGuard } from "./AccountantGuard";
import { AccountantMobileNav } from "./AccountantMobileNav";
import { ClaimantBar } from "./ClaimantBar";
import { ClaimantGuard } from "./ClaimantGuard";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { BreathingBackground } from "./BreathingBackground";
import { PasswordGate } from "./PasswordGate";
import { MobileNavigation } from "./MobileNavigation";
import { PullToRefresh } from "./PullToRefresh";
import { ScreenReady } from "./ScreenReady";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  // Screens start afresh when the business's currency or market changes, so every amount is rewritten.
  const { currency, market } = useConfigurationContext();
  const accountant = useIsAccountant();
  const claimant = useIsClaimant();
  return (
    <DataImportProvider>
      <BreathingBackground />
      <ScreenReady />
      <AccountantGuard />
      <ClaimantGuard />
      <PasswordGate />
      {claimant ? <ClaimantBar /> : null}
      <PullToRefresh />
      <ErrorBoundary FallbackComponent={Error} key={`${currency}-${market}`}>
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
          {children}
        </Suspense>
      </ErrorBoundary>
      {claimant ? null : accountant ? (
        <AccountantMobileNav />
      ) : (
        <MobileNavigation />
      )}
      <Notification mobileOffset={{ bottom: "96px" }} />
    </DataImportProvider>
  );
};
