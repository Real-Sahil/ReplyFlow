// Mileage claims for business journeys in the owner's or a worker's own vehicle, at HMRC's approved
// rates. The rates are a starting point: check them against HMRC's current figures, and they can be
// changed on the screen. Pure helpers, so the arithmetic can be tested.

export const MILEAGE_RATES = [
  {
    id: "car_first",
    label: "Car or van, first 10,000 miles in the tax year",
    pence: 45,
  },
  { id: "car_after", label: "Car or van, over 10,000 miles", pence: 25 },
  { id: "motorcycle", label: "Motorcycle", pence: 24 },
  { id: "bicycle", label: "Bicycle", pence: 20 },
] as const;

// What a journey costs, in pence, for miles at a rate in pence per mile. Rounded to the nearest penny.
export const mileageAmountPence = (miles: number, ratePencePerMile: number) =>
  Math.round(miles * ratePencePerMile);

// The wording that goes in the money book, so the report says what the amount is.
export const mileageNote = (
  miles: number,
  ratePencePerMile: number,
  journey: string,
) => {
  const m = Number(miles.toFixed(1)).toString();
  return `${m} mile${miles === 1 ? "" : "s"} at ${ratePencePerMile}p a mile: ${journey.trim()}`;
};
