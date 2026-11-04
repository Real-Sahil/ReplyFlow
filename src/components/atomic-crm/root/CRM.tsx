import { PostImport } from "../posts/PostImport";
import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import { useEffect, useMemo } from "react";
import { Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Admin } from "@/components/admin/admin";
import { ForgotPasswordPage } from "@/components/supabase/forgot-password-page";
import { SetPasswordPage } from "@/components/supabase/set-password-page";
import { OAuthConsentPage } from "@/components/supabase/oauth-consent-page";

import companies from "../companies";
import inbox from "../inbox";
import messengerSettings from "../messengerSettings";
import orders from "../orders";
import savedReplies from "../savedReplies";
import posts from "../posts";
import products from "../products";
import contacts from "../contacts";
import { Dashboard } from "../dashboard/Dashboard";
import { MobileDashboard } from "../dashboard/MobileDashboard";
import deals from "../deals";
import { Layout } from "../layout/Layout";
import { MobileLayout } from "../layout/MobileLayout";
import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import sales from "../sales";
import { SettingsPageMobile } from "../settings/SettingsPageMobile";
import { ProfilePage } from "../settings/ProfilePage";
import { asMobileScreen } from "../layout/MobileScreen";
import { lazyScreen } from "./lazyScreen";
import { SettingsPage } from "../settings/SettingsPage";
import {
  CONFIGURATION_STORE_KEY,
  type ConfigurationContextValue,
} from "./ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import {
  defaultCompanySectors,
  defaultCurrency,
  defaultDarkModeLogo,
  defaultDealCategories,
  defaultDealPipelineStatuses,
  defaultDealStages,
  defaultLightModeLogo,
  defaultNoteStatuses,
  defaultTaskTypes,
  defaultTitle,
} from "./defaultConfiguration";
import { i18nProvider as defaulti18nProvider } from "../providers/commons/i18nProvider";
import { StartPage } from "../login/StartPage.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { MobileTasksList } from "../tasks/MobileTasksList.tsx";
import { ContactListMobile } from "../contacts/ContactList.tsx";
import { ContactShow } from "../contacts/ContactShow.tsx";
import { CompanyShow } from "../companies/CompanyShow.tsx";
import { NoteShowPage } from "../notes/NoteShowPage.tsx";

// Screens that are only opened now and then load on demand.
const BusinessSettingsPage = lazyScreen(
  () => import("../finance/BusinessSettingsPage"),
  "BusinessSettingsPage",
);
const InvoicesPage = lazyScreen(
  () => import("../finance/InvoicesPage"),
  "InvoicesPage",
);
const BillsPage = lazyScreen(() => import("../finance/BillsPage"), "BillsPage");
const MoneyPage = lazyScreen(() => import("../finance/MoneyPage"), "MoneyPage");
const StockPage = lazyScreen(() => import("../stock/StockPage"), "StockPage");
const ReportsPage = lazyScreen(
  () => import("../finance/ReportsPage"),
  "ReportsPage",
);
const SuppliersPage = lazyScreen(
  () => import("../stock/SuppliersPage"),
  "SuppliersPage",
);
const BankMatchPage = lazyScreen(
  () => import("../finance/BankMatchPage"),
  "BankMatchPage",
);
const SummaryPage = lazyScreen(
  () => import("../finance/SummaryPage"),
  "SummaryPage",
);
const OwedPage = lazyScreen(() => import("../finance/OwedPage"), "OwedPage");
const AccountantPackPage = lazyScreen(
  () => import("../finance/AccountantPackPage"),
  "AccountantPackPage",
);
const ErrorLogPage = lazyScreen(
  () => import("../errors/ErrorLogPage"),
  "ErrorLogPage",
);
const FacebookConnectionPage = lazyScreen(
  () => import("../facebook/FacebookConnectionPage"),
  "FacebookConnectionPage",
);
const TransactionsPage = lazyScreen(
  () => import("../orders/TransactionsPage"),
  "TransactionsPage",
);
const TrackedLinksPage = lazyScreen(
  () => import("../links/TrackedLinksPage"),
  "TrackedLinksPage",
);
const AccountsPage = lazyScreen(
  () => import("../accounts/AccountsPage"),
  "AccountsPage",
);

const defaultStore = localStorageStore(undefined, "CRM");

export type CRMProps = {
  dataProvider?: CrmDataProvider;
  authProvider?: AuthProvider;
  i18nProvider?: CoreAdminProps["i18nProvider"];
  disableTelemetry?: boolean;
  store?: CoreAdminProps["store"];
  dashboard?: DashboardComponent;
  layout?: LayoutComponent;
} & Partial<ConfigurationContextValue>;

/**
 * CRM Component
 *
 * This component sets up and renders the main CRM application using `ra-core`. It provides
 * default configurations and themes but allows for customization through props. The component
 * seeds the store with any custom prop values for backwards compatibility.
 *
 * @param {LabeledValue[]} companySectors - The list of company sectors used in the application.
 * @param {string} currency - The ISO 4217 currency code used to format monetary values (e.g. "USD", "EUR", "GBP").
 * @param {RaThemeOptions} darkTheme - The theme to use when the application is in dark mode.
 * @param {LabeledValue[]} dealCategories - The categories of deals used in the application.
 * @param {string[]} dealPipelineStatuses - The statuses of deals in the pipeline used in the application.
 * @param {DealStage[]} dealStages - The stages of deals used in the application.
 * @param {RaThemeOptions} lightTheme - The theme to use when the application is in light mode.
 * @param {string} darkModeLogo - Logo shown in dark mode and on the auth pages. Must be an imported asset, an absolute URL, or a data URI — never a route-relative path like "./logos/x.svg", which breaks on nested routes such as /oauth/consent (issue #291).
 * @param {string} lightModeLogo - Logo shown in light mode. Same rule as darkModeLogo: imported asset, absolute URL, or data URI only.
 * @param {NoteStatus[]} noteStatuses - The statuses of notes used in the application.
 * @param {LabeledValue[]} taskTypes - The types of tasks used in the application.
 * @param {string} title - The title of the CRM application.
 *
 * @returns {JSX.Element} The rendered CRM application.
 *
 * @example
 * // Basic usage of the CRM component
 * import { CRM } from '@/components/atomic-crm/dashboard/CRM';
 *
 * const App = () => (
 *     <CRM
 *         darkModeLogo="https://example.com/logo-dark.svg"
 *         lightModeLogo="https://example.com/logo-light.svg"
 *         title="My Custom CRM"
 *         lightTheme={{
 *             ...defaultTheme,
 *             palette: {
 *                 primary: { main: '#0000ff' },
 *             },
 *         }}
 *     />
 * );
 *
 * export default App;
 */
export const CRM = ({
  companySectors = defaultCompanySectors,
  currency = defaultCurrency,
  dealCategories = defaultDealCategories,
  dealPipelineStatuses = defaultDealPipelineStatuses,
  dealStages = defaultDealStages,
  darkModeLogo = defaultDarkModeLogo,
  lightModeLogo = defaultLightModeLogo,
  noteStatuses = defaultNoteStatuses,
  taskTypes = defaultTaskTypes,
  title = defaultTitle,
  dataProvider = defaultDataProviderBuilder(),
  authProvider = defaultAuthProviderBuilder(),
  i18nProvider = defaulti18nProvider,
  store = defaultStore,
  disableTelemetry,
  ...rest
}: CRMProps) => {
  useEffect(() => {
    if (
      disableTelemetry ||
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      typeof window.location === "undefined" ||
      typeof Image === "undefined"
    ) {
      return;
    }
    const img = new Image();
    img.src = `https://atomic-crm-telemetry.marmelab.com/atomic-crm-telemetry?domain=${window.location.hostname}`;
  }, [disableTelemetry]);

  // Seed the store with CRM prop values if not already stored
  // (backwards compatibility for prop-based config)
  useEffect(() => {
    if (!store.getItem(CONFIGURATION_STORE_KEY)) {
      store.setItem(CONFIGURATION_STORE_KEY, {
        companySectors,
        currency,
        dealCategories,
        dealPipelineStatuses,
        dealStages,
        noteStatuses,
        taskTypes,
        title,
        darkModeLogo,
        lightModeLogo,
      } satisfies ConfigurationContextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const isMobile = useIsMobile();

  // on login, pre-fetch the configuration to avoid a flickering
  // when accessing the app for the first time
  const wrappedAuthProvider = useMemo<AuthProvider>(
    () => ({
      ...authProvider,
      login: async (params: any) => {
        const result = await authProvider.login(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      handleCallback: async (params: any) => {
        if (!authProvider.handleCallback) {
          throw new Error(
            "handleCallback is not implemented in the authProvider",
          );
        }
        const result = await authProvider.handleCallback(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      logout: async (params: any) => {
        try {
          store.removeItem(CONFIGURATION_STORE_KEY);
        } catch {
          // Ignore
        }
        return authProvider.logout(params);
      },
    }),
    [authProvider, dataProvider, store],
  );

  const ResponsiveAdmin = isMobile ? MobileAdmin : DesktopAdmin;

  return (
    <ResponsiveAdmin
      dataProvider={dataProvider}
      authProvider={wrappedAuthProvider}
      i18nProvider={i18nProvider}
      store={store}
      loginPage={StartPage}
      requireAuth
      disableTelemetry
      {...rest}
    />
  );
};

const DesktopAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? Layout}
      dashboard={props.dashboard ?? Dashboard}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
        <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
      </CustomRoutes>

      <CustomRoutes>
        <Route path={ProfilePage.path} element={<ProfilePage />} />
        <Route path={SettingsPage.path} element={<SettingsPage />} />
        <Route path="/facebook" element={<FacebookConnectionPage />} />
        <Route path="/errors" element={<ErrorLogPage />} />
        <Route path="/business" element={<BusinessSettingsPage />} />
        <Route path="/owed" element={<OwedPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/bank" element={<BankMatchPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/accountant" element={<AccountantPackPage />} />
        <Route path={ImportPage.path} element={<ImportPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/links" element={<TrackedLinksPage />} />
        <Route path="/posts/import" element={<PostImport />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path={ChangelogPage.path} element={<ChangelogPage />} />
      </CustomRoutes>
      <Resource name="deals" {...deals} />
      <Resource name="contacts" {...contacts} />
      <Resource name="companies" {...companies} />
      <Resource name="orders" {...orders} />
      <Resource name="products" {...products} />
      <Resource name="contact_notes" />
      <Resource name="deal_notes" />
      <Resource name="tasks" />
      <Resource name="sales" {...sales} />
      <Resource name="tags" />
      <Resource name="messenger_messages" />
      <Resource name="messenger_inbox" {...inbox} />
      <Resource name="saved_replies" {...savedReplies} />
      <Resource name="messenger_settings" {...messengerSettings} />
      <Resource name="messenger_conversation_state" />
      <Resource name="page_comments" />
      <Resource name="audit_log" />
      <Resource name="page_posts" {...posts} />
    </Admin>
  );
};

// Screens that exist only as desktop pages, shown on the phone inside a mobile frame so that
// every link in the bottom bar and the More sheet leads somewhere.
const MobileDeals = asMobileScreen("Deals", deals.list);
const MobileCompanies = asMobileScreen("Companies", companies.list);
const MobileCompanyCreate = asMobileScreen("New company", companies.create);
const MobileCompanyEdit = asMobileScreen("Edit company", companies.edit);
const MobileSales = asMobileScreen("Team", sales.list);
const MobileSalesCreate = asMobileScreen("New team member", sales.create);
const MobileSalesEdit = asMobileScreen("Edit team member", sales.edit);
const MobileProfile = asMobileScreen("My profile", ProfilePage);
const MobileImport = asMobileScreen("Import data", ImportPage);
const MobileAccountant = asMobileScreen(
  "Accountant's pack",
  AccountantPackPage,
);
const MobileReports = asMobileScreen("Reports", ReportsPage);
const MobileStock = asMobileScreen("Stock", StockPage);
const MobileMoney = asMobileScreen("Money book", MoneyPage);
const MobileBills = asMobileScreen("Bills and expenses", BillsPage);
const MobileInvoices = asMobileScreen("Invoices", InvoicesPage);
const MobileOwed = asMobileScreen("Owed and owing", OwedPage);
const MobileSummary = asMobileScreen("Weekly summary", SummaryPage);
const MobileBank = asMobileScreen("Bank match", BankMatchPage);
const MobileSuppliers = asMobileScreen("Suppliers and shopping", SuppliersPage);
const MobileBusiness = asMobileScreen("Business and VAT", BusinessSettingsPage);

const MobileAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });
  const asyncStoragePersister = createAsyncStoragePersister({
    storage: localStorage,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        dehydrateOptions: {
          // Picks the queries saved to localStorage for offline use: successful
          // ones (react-query's default rule, inlined because the persister
          // types its own copy of query-core), except those flagged with
          // `meta: { persist: false }`, like the global search, which caches one
          // query per typed term.
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.meta?.persist !== false,
        },
      }}
    >
      <Admin
        queryClient={queryClient}
        layout={props.layout ?? MobileLayout}
        dashboard={props.dashboard ?? MobileDashboard}
        {...props}
      >
        <CustomRoutes noLayout>
          <Route path={SignupPage.path} element={<SignupPage />} />
          <Route
            path={ConfirmationRequired.path}
            element={<ConfirmationRequired />}
          />
          <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
          <Route
            path={ForgotPasswordPage.path}
            element={<ForgotPasswordPage />}
          />
          <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
        </CustomRoutes>
        <CustomRoutes>
          <Route
            path={SettingsPageMobile.path}
            element={<SettingsPageMobile />}
          />
          <Route path={ProfilePage.path} element={<MobileProfile />} />
          <Route path={ImportPage.path} element={<MobileImport />} />
          <Route path="/facebook" element={<FacebookConnectionPage />} />
          <Route path="/errors" element={<ErrorLogPage />} />
          <Route path="/business" element={<MobileBusiness />} />
          <Route path="/owed" element={<MobileOwed />} />
          <Route path="/summary" element={<MobileSummary />} />
          <Route path="/bank" element={<MobileBank />} />
          <Route path="/suppliers" element={<MobileSuppliers />} />
          <Route path="/invoices" element={<MobileInvoices />} />
          <Route path="/bills" element={<MobileBills />} />
          <Route path="/money" element={<MobileMoney />} />
          <Route path="/stock" element={<MobileStock />} />
          <Route path="/reports" element={<MobileReports />} />
          <Route path="/accountant" element={<MobileAccountant />} />
          <Route path={ChangelogPage.path} element={<ChangelogPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/links" element={<TrackedLinksPage />} />
          <Route path="/posts/import" element={<PostImport />} />
          <Route path="/accounts" element={<AccountsPage />} />
        </CustomRoutes>
        <Resource
          name="contacts"
          list={ContactListMobile}
          show={ContactShow}
          recordRepresentation={contacts.recordRepresentation}
        >
          <Route path=":id/notes/:noteId" element={<NoteShowPage />} />
        </Resource>
        <Resource
          name="companies"
          list={MobileCompanies}
          create={MobileCompanyCreate}
          edit={MobileCompanyEdit}
          show={CompanyShow}
        />
        <Resource name="deals" list={MobileDeals} />
        <Resource
          name="sales"
          list={MobileSales}
          create={MobileSalesCreate}
          edit={MobileSalesEdit}
          recordRepresentation={sales.recordRepresentation}
        />
        <Resource name="tasks" list={MobileTasksList} />
        <Resource name="messenger_messages" />
        <Resource name="messenger_inbox" {...inbox} />
        <Resource name="saved_replies" />
        <Resource name="page_comments" />
        <Resource name="audit_log" />
        <Resource name="page_posts" {...posts} />
        <Resource name="messenger_settings" {...messengerSettings} />
        <Resource name="products" {...products} />
        <Resource name="orders" {...orders} />
      </Admin>
    </PersistQueryClientProvider>
  );
};
