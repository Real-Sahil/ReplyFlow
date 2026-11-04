import { lazy, Suspense, type ComponentType } from "react";

// Loads a screen the first time it is opened, so the first page of the app is smaller.
// `name` is the screen's named export.
export const lazyScreen = <P extends object = object>(
  load: () => Promise<Record<string, unknown>>,
  name: string,
): ComponentType<P> => {
  const Screen = lazy(async () => ({
    default: (await load())[name] as ComponentType<P>,
  }));
  const Wrapped = (props: P) => (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground" role="status">
          Loading…
        </div>
      }
    >
      <Screen {...(props as P & React.JSX.IntrinsicAttributes)} />
    </Suspense>
  );
  Wrapped.displayName = `Lazy(${name})`;
  return Wrapped;
};

// The screens people open most are fetched in the background once the app has settled, so the first
// tap is not waiting on the network and the transition can start straight away.
export const preloadCommonScreens = () => {
  const load = () => {
    void import("../contacts/ContactList");
    void import("../contacts/ContactShow");
    void import("../orders/OrderList");
    void import("../orders/OrderEdit");
    void import("../inbox/InboxList");
    void import("../deals/DealList");
    void import("../posts/PostScreens");
    void import("../products/ProductList");
  };
  const idle = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(load, { timeout: 4000 });
  else window.setTimeout(load, 2500);
};
