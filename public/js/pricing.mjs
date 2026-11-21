// The price of a Dutch auction at a given moment: a straight line from the starting price
// (at startsAt) down to the lowest price (at endsAt).
//
// This is the SAME formula as dutchPrice() in src/patterns/strategy/DutchAuctionStrategy.js.
// The browser only uses it to animate the falling price; the server recomputes the price
// when someone accepts, so the server always has the last word.
// (test/pricing.test.js checks that both give exactly the same numbers.)
export function dutchPrice({ startPrice, floorPrice, startsAt, endsAt }, now) {
  if (now <= startsAt) return startPrice;
  if (now >= endsAt) return floorPrice;
  const progress = (now - startsAt) / (endsAt - startsAt);
  return Math.max(floorPrice, Math.round(startPrice - (startPrice - floorPrice) * progress));
}
