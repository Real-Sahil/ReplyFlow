import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { useIsAccountant } from "../misc/useIsAccountant";
import { useIsClaimant } from "../misc/useIsClaimant";
import { AccountantGuard } from "./AccountantGuard";
import { ClaimantBar } from "./ClaimantBar";
import { ClaimantGuard } from "./ClaimantGuard";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { BreathingBackground } from "./BreathingBackground";
import { PasswordGate } from "./PasswordGate";
import { AccountantToolbar, RecordBackLink, Toolbar } from "./Header";
import { ScreenReady } from "./ScreenReady";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  // Screens start afresh when the business's currency or market changes, so every amount is rewritten.
  const { currency, market } = useConfigurationContext();
  useGlobalShortcuts();
  const accountant = useIsAccountant();
  const claimant = useIsClaimant();
  return (
    <DataImportProvider>
      <div className="min-h-screen">
        <BreathingBackground />
        <ScreenReady />
        <AccountantGuard />
        <ClaimantGuard />
        <PasswordGate />
        {claimant ? (
          <ClaimantBar />
        ) : accountant ? (
          <AccountantToolbar />
        ) : (
          <Toolbar />
        )}
        <main
          className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-6 md:py-8"
          id="main-content"
        >
          {accountant || claimant ? null : <RecordBackLink />}
          <ErrorBoundary
            FallbackComponent={Error}
            key={`${currency}-${market}`}
          >
            <Suspense
              fallback={<Skeleton className="h-12 w-12 rounded-full" />}
            >
              {children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Notification />
    </DataImportProvider>
  );
};
