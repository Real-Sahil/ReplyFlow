import { useResourceContext, useCreatePath } from "ra-core";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const MobileBackButton = (props: { resource?: string; to?: string }) => {
  const resource = useResourceContext(props);
  const navigate = useNavigate();
  const location = useLocation();
  const createPath = useCreatePath();
  const { to } = props;
  // A screen that is not a list (Owed, Bills, People, ...) has no list page to go back to, so it goes
  // back to wherever the person came from.
  const listPath = resource
    ? createPath({ resource, type: "list" })
    : undefined;
  // On the list itself, "back" cannot mean "to the list": it goes to where the person came from.
  const finalTo = to ?? (listPath === location.pathname ? undefined : listPath);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="rounded-full size-5 pr-2"
      onClick={(e) => {
        e.preventDefault();
        if (finalTo) navigate(finalTo);
        else if (window.history.length > 1) navigate(-1);
        else navigate("/");
      }}
    >
      <ChevronLeft className="size-6" />
      <span className="sr-only">Back{to ? "" : " to list"}</span>
    </Button>
  );
};
