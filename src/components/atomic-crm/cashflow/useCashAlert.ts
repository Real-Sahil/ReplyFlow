import { useMemo } from "react";

import { useBills } from "../finance/useBills";
import { useMoney } from "../finance/useMoney";
import { useOwedByCustomers } from "../finance/useOwed";
import { todayIso } from "../importer/engine";
import { buildForecast, type Forecast } from "./forecast";
import { useCashBalance } from "./useCashBalance";

// For the Today screen: will the bank balance go below zero in the next three weeks? Null when it will
// not, or when no balance has been entered (nothing is guessed without a starting point).
export const useCashAlert = (enabled: boolean, days = 21): Forecast | null => {
  const balance = useCashBalance(enabled);
  const planned = useMoney({ state: "planned" });
  const bills = useBills({ status: "unpaid" });
  const owed = useOwedByCustomers();
  return useMemo(() => {
    if (!enabled || !balance.data) return null;
    const forecast = buildForecast({
      openingPence: balance.data.balance_pence,
      today: todayIso(),
      days,
      planned: (planned.data ?? []).map((e) => ({
        entry_date: e.entry_date,
        direction: e.direction,
        amount_pence: e.amount_pence,
        counterparty: e.counterparty,
        note: e.note,
      })),
      bills: (bills.data ?? []).map((b) => ({
        supplier_name: b.supplier_name,
        bill_date: b.bill_date,
        due_date: b.due_date,
        gross_pence: b.gross_pence,
        description: b.description,
      })),
      owed: (owed.data ?? []).map((o) => ({
        customer_name: o.customer_name,
        order_reference: o.order_reference,
        due_date: o.due_date,
        owed_pence: o.owed_pence,
      })),
      lateCustomerDays: 14,
    });
    return forecast.firstBelowZero ? forecast : null;
  }, [enabled, balance.data, planned.data, bills.data, owed.data, days]);
};
