// The browser animates the Dutch price with its own copy of the formula (public/js/pricing.mjs).
// If the two copies ever disagreed, buyers would see one price and pay another. This test prevents that.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dutchPrice: serverPrice } = require('../src/patterns/strategy/DutchAuctionStrategy');

const auctions = [
  { startPrice: 500, floorPrice: 100, startsAt: 1_000_000, endsAt: 1_100_000 },
  { startPrice: 1000, floorPrice: 999, startsAt: 5_000, endsAt: 35_000 },   // tiny range
  { startPrice: 7, floorPrice: 1, startsAt: 0, endsAt: 86_400_000 },        // 24 hours, tiny prices
  { startPrice: 999_999_999, floorPrice: 1, startsAt: 123_456, endsAt: 123_456 + 30_001 }, // huge prices, odd duration
];

test('browser and server compute exactly the same Dutch price', async () => {
  const { dutchPrice: browserPrice } = await import('../public/js/pricing.mjs');

  for (const auction of auctions) {
    const span = auction.endsAt - auction.startsAt;
    for (let i = -5; i <= 1005; i++) {
      const now = auction.startsAt + Math.round((span * i) / 1000) + (i % 7); // includes before start and after end
      assert.equal(browserPrice(auction, now), serverPrice(auction, now), `different price at ${now}`);
    }
  }
});
