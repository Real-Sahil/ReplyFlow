import { Droppable } from "@hello-pangea/dnd";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { findDealLabel } from "./dealUtils";
import { DealCard } from "./DealCard";

export const DealColumn = ({
  stage,
  deals,
}: {
  stage: string;
  deals: Deal[];
}) => {
  const totalAmount = deals.reduce((sum, deal) => sum + deal.amount, 0);
  const { dealStages, currency } = useConfigurationContext();
  return (
    <div className="flex-1 pb-8">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold">
          {findDealLabel(dealStages, stage)}
          <span className="ml-1.5 font-mono font-normal text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </h3>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {totalAmount.toLocaleString("en-US", {
            notation: "compact",
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
            minimumSignificantDigits: 3,
          })}
        </p>
      </div>
      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`flex flex-col rounded-xl mt-2 gap-2 p-1 transition-colors ${
              snapshot.isDraggingOver ? "bg-accent" : ""
            }`}
          >
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
