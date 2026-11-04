import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { MILEAGE_RATES, mileageAmountPence, mileageNote } from "./mileage";
import { MONEY_KEY } from "./moneyTypes";

// A business journey in a personal vehicle, recorded in the money book at the approved rate.
export const MileageDialog = ({ onClose }: { onClose: () => void }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [miles, setMiles] = useState("");
  const [rateId, setRateId] = useState<string>(MILEAGE_RATES[0].id);
  const [rateText, setRateText] = useState<string | null>(null);
  const [journey, setJourney] = useState("");
  const preset = MILEAGE_RATES.find((r) => r.id === rateId) ?? MILEAGE_RATES[0];
  const rate = Number(rateText ?? preset.pence);
  const milesNumber = Number(miles);
  const valid =
    milesNumber > 0 && rate > 0 && journey.trim().length >= 3 && !!date;
  const pence = valid ? mileageAmountPence(milesNumber, rate) : 0;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("money_entries")
        .insert({
          direction: "out",
          category: "travel_out",
          status: "done",
          entry_date: date,
          amount_pence: pence,
          payment_method: "other",
          vat_code: "O",
          vat_pence: 0,
          note: mileageNote(milesNumber, rate, journey),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      notify("Mileage added to the money book", { type: "success" });
      void queryClient.invalidateQueries({ queryKey: MONEY_KEY });
      onClose();
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add mileage</DialogTitle>
          <DialogDescription>
            A business journey in a personal vehicle. These are the usual HMRC
            approved rates; check them against HMRC&apos;s current figures.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mi-date">Date</Label>
            <Input
              id="mi-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mi-miles">Miles</Label>
            <Input
              id="mi-miles"
              inputMode="decimal"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mi-rate">Rate</Label>
            <select
              id="mi-rate"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={rateId}
              onChange={(e) => {
                setRateId(e.target.value);
                setRateText(null);
              }}
            >
              {MILEAGE_RATES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.pence}p)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mi-pence">Pence a mile</Label>
            <Input
              id="mi-pence"
              inputMode="decimal"
              value={rateText ?? String(preset.pence)}
              onChange={(e) => setRateText(e.target.value)}
            />
          </div>
          <div className="flex items-end text-sm text-muted-foreground">
            {valid ? (
              <>
                Claim:{" "}
                <b className="ml-1 text-foreground tabular-nums">
                  {formatPence(pence)}
                </b>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mi-journey">Where to and why</Label>
            <Input
              id="mi-journey"
              value={journey}
              onChange={(e) => setJourney(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
