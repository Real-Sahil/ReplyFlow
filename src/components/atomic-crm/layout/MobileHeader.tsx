import { useEffect, useRef } from "react";

import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { MobileRefreshButton } from "./MobileRefreshButton";

// The search lives here rather than in each screen: there is no Cmd+K on a
// phone, so this header is the only place reachable from every mobile page.
// Refresh only earns its space on the list pages, whose content changes under
// the user; elsewhere it would just crowd the header.
//
// The bar starts clear. As the page scrolls it fills in with a blur and a
// hairline, and on screens with a large title (see MobileContent) the small
// title in the bar fades in as the large one scrolls away.
const MobileHeader = ({
  children,
  showRefresh = false,
}: {
  children: React.ReactNode;
  showRefresh?: boolean;
}) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const scroller = document.getElementById("main-content");
    const header = ref.current;
    if (!scroller || !header) return;
    const large = scroller.dataset.largeTitle === "true";
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = scroller.scrollTop;
      header.style.setProperty("--edge", String(Math.min(1, y / 16)));
      header.style.setProperty(
        "--title-o",
        large ? String(Math.min(1, Math.max(0, (y - 24) / 24))) : "1",
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      ref={ref}
      data-slot="mobile-header"
      className="fixed top-0 left-0 right-0 z-10 flex h-14 w-full items-center justify-between px-4"
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 border-b border-border backdrop-blur-xl"
        style={{ opacity: "var(--edge, 1)", background: "var(--toolbar)" }}
      />
      <div
        className="flex min-w-0 flex-1 items-center"
        style={{ opacity: "var(--title-o, 1)" }}
      >
        {children}
      </div>
      <div className="flex items-center">
        <GlobalSearchButton variant="icon" />
        {showRefresh ? <MobileRefreshButton /> : null}
      </div>
    </header>
  );
};

export default MobileHeader;
