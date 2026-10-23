import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";

import { listPages } from "../facebook/metaPages";

// Chooses the Facebook Page a post goes to. "" means the default Page.
export const PagePicker = ({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (pageId: string) => void;
  disabled?: boolean;
}) => {
  const { data: pages = [] } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });
  if (pages.length < 2) return null;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="post-page">Post to</Label>
      <select
        id="post-page"
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Default Page</option>
        {pages.map((page) => (
          <option key={page.page_id} value={page.page_id}>
            {page.name || page.page_id}
          </option>
        ))}
      </select>
    </div>
  );
};
