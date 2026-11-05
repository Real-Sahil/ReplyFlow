import { useCallback } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { currencySymbol, formatMoney } from "./moneyFormat";

// For a component that writes amounts: it follows the business's currency and market, and writes in the
// currency of a record when one is given (an invoice keeps the currency it was made in).
export const useMoney = () => {
  const { currency, market } = useConfigurationContext();
  const format = useCallback(
    (pence: number, recordCurrency?: string | null) =>
      formatMoney(pence, { currency: recordCurrency }),
    // The business's setting decides how the shared formatter writes, so changing it changes the function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, market],
  );
  return { currency, market, format, symbol: currencySymbol() };
};
