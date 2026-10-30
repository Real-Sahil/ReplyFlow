import { useEffect } from "react";
import { useNavigate } from "react-router";

const GO_TO: Record<string, string> = {
  t: "/",
  i: "/messenger_inbox",
  c: "/contacts",
  d: "/deals",
  o: "/orders",
  p: "/page_posts",
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// "g" then a letter jumps to a section, like a desktop app: g t Today, g i Inbox,
// g c Contacts, g d Deals, g o Orders, g p Posts. Ignored while typing.
export const useGlobalShortcuts = () => {
  const navigate = useNavigate();
  useEffect(() => {
    let armed = false;
    let timer: number | undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (armed) {
        const path = GO_TO[e.key.toLowerCase()];
        armed = false;
        window.clearTimeout(timer);
        if (path) {
          e.preventDefault();
          navigate(path);
        }
        return;
      }
      if (e.key === "g") {
        armed = true;
        timer = window.setTimeout(() => (armed = false), 1000);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [navigate]);
};
