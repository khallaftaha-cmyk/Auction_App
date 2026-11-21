// Strategy pattern: the rules of each auction type. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getStrategy } = require('../src/patterns/factory');

const english = getStrategy('english');
const sealed = getStrategy('sealed');

const auction = { id: 1, startPrice: 100, minIncrement: 10, status: 'open' };
const bid = (id, userId, amount) => ({ id, userId, username: `user${userId}`, amount, placedAt: id });
const user = (id) => ({ id, username: `user${id}` });

// ---- English ----------------------------------------------------------------------
test('english: the first bid must reach the starting price', () => {
  assert.throws(() => english.validateBid({ auction, bids: [], user: user(2), amount: 99 }), { code: 'BID_TOO_LOW' });
  assert.doesNotThrow(() => english.validateBid({ auction, bids: [], user: user(2), amount: 100 }));
});

test('english: each bid must beat the highest one by the minimum raise', () => {
  const bids = [bid(1, 2, 100)];
  assert.equal(english.minimumBid(auction, 100), 110);
  assert.throws(() => english.validateBid({ auction, bids, user: user(3), amount: 109 }), { code: 'BID_TOO_LOW' });
  assert.doesNotThrow(() => english.validateBid({ auction, bids, user: user(3), amount: 110 }));
});

test('english: the current leader cannot outbid themselves', () => {
  const bids = [bid(1, 2, 100)];
  assert.throws(() => english.validateBid({ auction, bids, user: user(2), amount: 500 }), { code: 'ALREADY_LEADING' });
});

test('english: the highest bid wins, and nobody wins without bids', () => {
  const bids = [bid(1, 2, 100), bid(2, 3, 150), bid(3, 2, 200)];
  assert.equal(english.determineWinner(auction, bids).amount, 200);
  assert.equal(english.determineWinner(auction, []), null);
});

test('english: the price is public, and equals the start price until someone bids', () => {
  assert.equal(english.publicPrice(auction, null), 100);
  assert.equal(english.publicPrice(auction, 140), 140);
  assert.equal(english.bidsArePublic, true);
});

test('english: everybody sees every bid', () => {
  const bids = [bid(1, 2, 100), bid(2, 3, 110)];
  assert.equal(english.visibleBids(auction, bids, 99).length, 2);
});

// ---- Sealed -----------------------------------------------------------------------
test('sealed: a bid must reach the starting price', () => {
  assert.throws(() => sealed.validateBid({ auction, bids: [], user: user(2), amount: 99 }), { code: 'BID_TOO_LOW' });
  assert.doesNotThrow(() => sealed.validateBid({ auction, bids: [], user: user(2), amount: 100 }));
});

test('sealed: one bid per person', () => {
  const bids = [bid(1, 2, 150)];
  assert.throws(() => sealed.validateBid({ auction, bids, user: user(2), amount: 300 }), { code: 'ALREADY_BID' });
  assert.doesNotThrow(() => sealed.validateBid({ auction, bids, user: user(3), amount: 120 }));
});

test('sealed: a lower bid than the leader is fine (nobody can see the leader)', () => {
  const bids = [bid(1, 2, 500)];
  assert.doesNotThrow(() => sealed.validateBid({ auction, bids, user: user(3), amount: 120 }));
});

test('sealed: the highest bid wins, the earliest bid wins a tie', () => {
  const bids = [bid(1, 2, 200), bid(2, 3, 200), bid(3, 4, 150)];
  assert.equal(sealed.determineWinner(auction, bids).userId, 2);
});

test('sealed: the price is hidden until the auction is closed', () => {
  assert.equal(sealed.publicPrice(auction, 500), null);
  assert.equal(sealed.publicPrice({ ...auction, status: 'closed' }, 500), 500);
  assert.equal(sealed.bidsArePublic, false);
});

test('sealed: you only see your own bid while the auction is open', () => {
  const bids = [bid(1, 2, 200), bid(2, 3, 300)];
  assert.deepEqual(sealed.visibleBids(auction, bids, 2).map((b) => b.id), [1]);
  assert.deepEqual(sealed.visibleBids(auction, bids, 99), []);
});

test('sealed: every bid is revealed once the auction is closed', () => {
  const bids = [bid(1, 2, 200), bid(2, 3, 300)];
  assert.equal(sealed.visibleBids({ ...auction, status: 'closed' }, bids, 99).length, 2);
});

// ---- Registry ---------------------------------------------------------------------
test('getStrategy rejects unknown names, including inherited object keys', () => {
  assert.throws(() => getStrategy('vickrey'), { code: 'BAD_STRATEGY' });
  assert.throws(() => getStrategy('constructor'), { code: 'BAD_STRATEGY' });
});
