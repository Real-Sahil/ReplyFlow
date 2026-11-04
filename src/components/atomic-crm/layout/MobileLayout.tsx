import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { useIsAccountant } from "../misc/useIsAccountant";
import { AccountantGuard } from "./AccountantGuard";
import { AccountantMobileNav } from "./AccountantMobileNav";
import { MobileNavigation } from "./MobileNavigation";
import { PullToRefresh } from "./PullToRefresh";
import { ScreenReady } from "./ScreenReady";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  const accountant = useIsAccountant();
  return (
    <DataImportProvider>
      <ScreenReady />
      <AccountantGuard />
      <PullToRefresh />
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
          {children}
        </Suspense>
      </ErrorBoundary>
      {accountant ? <AccountantMobileNav /> : <MobileNavigation />}
      <Notification mobileOffset={{ bottom: "96px" }} />
    </DataImportProvider>
  );
};
