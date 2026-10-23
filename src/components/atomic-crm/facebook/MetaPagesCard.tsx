import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { listPages, managePage, type ManagedPage } from "./metaPages";

// The Pages the team can post to and reply from. Pick one in the list to make it the default
// for posts that do not name a Page. Adding a Page needs its Page access token; Facebook checks it.
export const MetaPagesCard = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: pages = [], isPending } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["meta_pages"] });

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await managePage(body);
      notify(done);
      refresh();
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
        { type: "error" },
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (await run({ action: "add", token }, "Page added")) setToken("");
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Facebook Pages</h2>
          <p className="text-sm text-muted-foreground">
            Posts go to the Page chosen on each post. A post without a Page goes
            to the default.
          </p>
        </div>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading Pages…</p>
        ) : pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Pages added yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {pages.map((page: ManagedPage) => (
              <li
                key={page.page_id}
                className="flex flex-wrap items-center gap-2 p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {page.name || "Unnamed Page"}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {page.page_id}
                  </span>
                  {page.is_default && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                      Default
                    </span>
                  )}
                </span>
                {!page.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        { action: "default", page_id: page.page_id },
                        "Default Page changed",
                      )
                    }
                  >
                    <Star /> Make default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      { action: "remove", page_id: page.page_id },
                      "Page removed",
                    )
                  }
                >
                  <Trash2 /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="page-token">
            Add a Page (paste its Page access token)
          </Label>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="page-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <Button onClick={add} disabled={busy || token.trim().length < 20}>
              <Plus /> Add Page
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The token is checked with Facebook and stored on the server. It is
            not shown again.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
