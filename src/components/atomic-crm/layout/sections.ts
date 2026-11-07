import { matchPath } from "react-router";

export const SECTIONS = [
  { path: "/", label: "Today" },
  { path: "/messenger_inbox", label: "Inbox" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/orders", label: "Orders" },
  { path: "/page_posts", label: "Posts" },
  { path: "/products", label: "Products" },
] as const;

// The section of the app the current address belongs to.
export const sectionFor = (pathname: string) => {
  if (matchPath("/", pathname)) return "/";
  return (
    SECTIONS.find((s) => s.path !== "/" && matchPath(`${s.path}/*`, pathname))
      ?.path ?? null
  );
};
