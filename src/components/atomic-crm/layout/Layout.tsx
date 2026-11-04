import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { useIsAccountant } from "../misc/useIsAccountant";
import { AccountantGuard } from "./AccountantGuard";
import { AccountantToolbar, RecordBackLink, Toolbar } from "./Header";
import { ScreenReady } from "./ScreenReady";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  useGlobalShortcuts();
  const accountant = useIsAccountant();
  return (
    <DataImportProvider>
      <div className="min-h-screen bg-background">
        <ScreenReady />
        <AccountantGuard />
        {accountant ? <AccountantToolbar /> : <Toolbar />}
        <main
          className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-6 md:py-8"
          id="main-content"
        >
          {accountant ? null : <RecordBackLink />}
          <ErrorBoundary FallbackComponent={Error}>
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
