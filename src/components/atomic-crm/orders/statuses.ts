export const orderStatuses = [
  { id: "quoted", name: "Quoted" },
  { id: "confirmed", name: "Confirmed" },
  { id: "deposit_paid", name: "Deposit paid" },
  { id: "in_production", name: "In production" },
  { id: "ready_for_delivery", name: "Ready for delivery" },
  { id: "delivery_booked", name: "Delivery booked" },
  { id: "delivered", name: "Delivered" },
  { id: "completed", name: "Completed" },
  { id: "cancelled", name: "Cancelled" },
];

export const orderStatusLabel = (id: string) =>
  orderStatuses.find((s) => s.id === id)?.name ?? id;
