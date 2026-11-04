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
