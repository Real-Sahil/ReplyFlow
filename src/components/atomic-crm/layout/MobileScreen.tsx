import type { ComponentType, ReactNode } from "react";

import { MobileBackButton } from "../misc/MobileBackButton";
import { MobileContent } from "./MobileContent";
import MobileHeader from "./MobileHeader";

// Gives a screen that was built for the desktop layout a phone frame: a header with a back
// button and a title, and a content area that scrolls above the bottom bar.
export const MobileScreen = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <>
    <MobileHeader>
      <MobileBackButton />
      <h1 className="truncate text-xl font-semibold">{title}</h1>
    </MobileHeader>
    <MobileContent>{children}</MobileContent>
  </>
);

// The same screen as a component, for routes and resources that take one.
export const asMobileScreen =
  (title: string, Screen: ComponentType): ComponentType =>
  () => (
    <MobileScreen title={title}>
      <Screen />
    </MobileScreen>
  );
