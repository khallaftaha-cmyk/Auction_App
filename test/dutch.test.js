// Strategy pattern: the Dutch auction (falling price, first buyer wins). No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getStrategy } = require('../src/patterns/factory');
const { dutchPrice } = require('../src/patterns/strategy/DutchAuctionStrategy');

const dutch = getStrategy('dutch');

// 500 MAD falling to 100 MAD over 100 seconds.
const START = 1_000_000;
const auction = { id: 1, status: 'open', startPrice: 500, floorPrice: 100, startsAt: START, endsAt: START + 100_000 };
const at = (seconds) => START + seconds * 1000;
const user = { id: 2, username: 'bob' };

// ---- the price curve --------------------------------------------------------------------
test('the price starts at the starting price and ends at the lowest price', () => {
  assert.equal(dutchPrice(auction, at(0)), 500);
  assert.equal(dutchPrice(auction, at(100)), 100);
});

test('the price falls in a straight line', () => {
  assert.equal(dutchPrice(auction, at(50)), 300);
  assert.equal(dutchPrice(auction, at(25)), 400);
  assert.equal(dutchPrice(auction, at(75)), 200);
});

test('before the start and after the end the price stays at its limits', () => {
  assert.equal(dutchPrice(auction, at(-10)), 500);
  assert.equal(dutchPrice(auction, at(500)), 100);
});

test('the price never rises and never goes below the lowest price', () => {
  let previous = Infinity;
  for (let ms = -1000; ms <= 101_000; ms += 250) {
    const price = dutchPrice(auction, START + ms);
    assert.ok(price <= previous, `price rose at +${ms} ms`);
    assert.ok(price >= 100 && price <= 500);
    previous = price;
  }
});

// ---- strategy rules ------------------------------------------------------------------------
test('the minimum bid and the public price are the current price', () => {
  assert.equal(dutch.minimumBid(auction, null, at(50)), 300);
  assert.equal(dutch.publicPrice(auction, null, at(50)), 300);
});

test('once closed, the public price is what the winner paid (or hidden if unsold)', () => {
  assert.equal(dutch.publicPrice({ ...auction, status: 'closed', winningAmount: 260 }, null, at(90)), 260);
  assert.equal(dutch.publicPrice({ ...auction, status: 'closed', winningAmount: null }, null, at(90)), null);
});

test('accepting at the current price (or at a higher price you saw) is allowed', () => {
  assert.doesNotThrow(() => dutch.validateBid({ auction, bids: [], user, amount: 300, now: at(50) }));
  assert.doesNotThrow(() => dutch.validateBid({ auction, bids: [], user, amount: 320, now: at(50) }));
});

test('accepting a price lower than the real current price is refused (stale screen)', () => {
  assert.throws(() => dutch.validateBid({ auction, bids: [], user, amount: 250, now: at(50) }), { code: 'PRICE_CHANGED' });
});

test('only the first buyer wins: a second acceptance is refused', () => {
  const bids = [{ id: 1, userId: 3, amount: 310 }];
  assert.throws(() => dutch.validateBid({ auction, bids, user, amount: 300, now: at(50) }), { code: 'ALREADY_SOLD' });
});

test('the buyer pays the server price, not the amount the browser sent', () => {
  assert.equal(dutch.resolveAmount({ auction, amount: 999, now: at(50) }), 300);
});

test('the auction ends on the first bid, and that bid wins', () => {
  assert.equal(dutch.endsOnFirstBid, true);
  const bids = [{ id: 1, userId: 3, amount: 310 }];
  assert.equal(dutch.determineWinner(auction, bids).userId, 3);
  assert.equal(dutch.determineWinner(auction, []), null);
});

test('the other auction types do not end on the first bid', () => {
  assert.equal(getStrategy('english').endsOnFirstBid, false);
  assert.equal(getStrategy('sealed').endsOnFirstBid, false);
  assert.equal(getStrategy('english').resolveAmount({ amount: 123 }), 123);
});
