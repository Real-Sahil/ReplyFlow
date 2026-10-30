import { type ReactNode } from "react";

// `title` turns on the large title: a big heading at the top of the page that
// scrolls away while the small title in the header fades in (MobileHeader).
export const MobileContent = ({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) => (
  <main
    className="max-w-screen-xl mx-auto pt-16 px-4 pb-28 h-dvh overflow-y-auto"
    id="main-content"
    data-large-title={title ? "true" : undefined}
  >
    {title ? (
      <p
        aria-hidden
        className="pt-1 pb-4 text-[2rem] leading-tight font-semibold tracking-tight"
      >
        {title}
      </p>
    ) : null}
    {children}
  </main>
);
