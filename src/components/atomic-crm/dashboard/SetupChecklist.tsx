import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

import { useBusinessSettings } from "../finance/useBusinessSettings";
import { getSupabaseClient } from "../providers/supabase/supabase";

const DISMISS_KEY = "replyflow.setup.dismissed";

const count = async (table: string) => {
  const { count: n, error } = await getSupabaseClient()
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return n ?? 0;
};

// A short list for a new business: what to set up first. It shows for administrators until every
// step is done or it is hidden, and each step is ticked from what is really in the system.
export const SetupChecklist = () => {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { data: settings, isPending } = useBusinessSettings();
  const { data: counts } = useQuery({
    queryKey: ["setup_counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const [products, contacts, staff] = await Promise.all([
        count("products"),
        count("contacts"),
        count("sales"),
      ]);
      return { products, contacts, staff };
    },
  });
  if (hidden || isPending || !counts) return null;

  const steps = [
    {
      done: !!(settings?.trading_name || settings?.legal_name),
      to: "/business",
      title: "Add your business details",
      detail: "Your name and address for invoices, and whether you charge VAT",
    },
    {
      done: counts.products > 0,
      to: "/products/create",
      title: "Add your first product",
      detail: "What you sell, so you can quote and invoice it",
    },
    {
      done: counts.contacts > 0,
      to: "/contacts/create",
      title: "Add your first customer",
      detail: "Or connect Facebook and they will arrive as they message you",
    },
    {
      done: counts.staff > 1,
      to: "/sales/create",
      title: "Invite your team or your accountant",
      detail:
        "An accountant can be given read-only access to the finance pages",
    },
  ];
  const finished = steps.filter((s) => s.done).length;
  if (finished === steps.length) return null;

  return (
    <section
      aria-label="Get set up"
      className="glass flex flex-col gap-2 rounded-2xl p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Get set up ({finished} of {steps.length} done)
        </h2>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:underline"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // Hiding for this visit only is fine.
            }
            setHidden(true);
          }}
        >
          Hide this
        </button>
      </div>
      <ul className="flex flex-col">
        {steps.map((s) => (
          <li key={s.title}>
            <Link
              to={s.to}
              className={cn(
                "press flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50",
                s.done && "opacity-60",
              )}
            >
              {s.done ? (
                <Check className="size-5 shrink-0 text-success" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    s.done && "line-through",
                  )}
                >
                  {s.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {s.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
