// Colour carries meaning on orders: grey for early or finished, blue for work in
// hand, amber for waiting on the customer or a booking, green once delivered.
export const orderStatusTone: Record<string, string> = {
  quoted: "bg-muted text-muted-foreground",
  confirmed: "bg-accent text-accent-foreground",
  deposit_paid: "bg-accent text-accent-foreground",
  in_production: "bg-primary/15 text-primary",
  ready_for_delivery: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivery_booked: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-destructive/10 text-destructive",
};
