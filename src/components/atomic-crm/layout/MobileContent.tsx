import { type ReactNode } from "react";

// `title` turns on the large title: a big heading at the top of the page that
// scrolls away while the small title in the header fades in (MobileHeader).
export const MobileContent = ({
  children,
  title,
  framed,
}: {
  children: ReactNode;
  title?: string;
  // A desktop page shown inside the phone frame: the frame's top bar already shows its title.
  framed?: boolean;
}) => (
  <main
    className="scroll-area max-w-screen-xl mx-auto pt-16 px-4 pb-28 h-dvh overflow-y-auto"
    id="main-content"
    data-large-title={title ? "true" : undefined}
    data-mobile-screen={framed ? "true" : undefined}
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
