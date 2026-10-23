import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { SideRail, TopBar } from "./Header";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <DataImportProvider>
      <div className="flex min-h-screen gap-4 bg-background p-3 md:p-4">
        <SideRail />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <TopBar />
          <main
            className="min-w-0 flex-1 rounded-3xl bg-card p-4 shadow-sm md:p-6"
            id="main-content"
          >
            <ErrorBoundary FallbackComponent={Error}>
              <Suspense
                fallback={<Skeleton className="h-12 w-12 rounded-full" />}
              >
                {children}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Notification />
    </DataImportProvider>
  );
};
