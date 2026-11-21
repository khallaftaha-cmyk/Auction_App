// Observer pattern: the Subject and the observers. A fake manager records what would be sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const Subject = require('../src/patterns/observer/Subject');
const BroadcastObserver = require('../src/patterns/observer/BroadcastObserver');
const OutbidObserver = require('../src/patterns/observer/OutbidObserver');

function fakeManager() {
  const calls = [];
  return {
    calls,
    broadcastAll: (type, payload) => calls.push({ to: 'all', type, payload }),
    broadcastRoom: (room, type, payload) => calls.push({ to: `room:${room}`, type, payload }),
    sendToUser: (userId, type, payload) => calls.push({ to: `user:${userId}`, type, payload }),
  };
}

const summary = { id: 5, title: 'Bike', status: 'open' };
const bidEvent = (extra = {}) => ({
  auctionId: 5,
  auction: summary,
  bid: { id: 9, username: 'carol', amount: 150 },
  bidderId: 3,
  previousTop: { userId: 2, username: 'bob', amount: 120 },
  bidsArePublic: true,
  ...extra,
});

// ---- Subject ---------------------------------------------------------------------
test('subject notifies every subscribed observer', () => {
  const subject = new Subject();
  const seen = [];
  subject.subscribe({ update: (event, data) => seen.push(['a', event, data]) });
  subject.subscribe({ update: (event, data) => seen.push(['b', event, data]) });
  subject.notify('BID_PLACED', 42);
  assert.deepEqual(seen, [['a', 'BID_PLACED', 42], ['b', 'BID_PLACED', 42]]);
});

test('unsubscribed observers are no longer notified', () => {
  const subject = new Subject();
  let count = 0;
  const unsubscribe = subject.subscribe({ update: () => count++ });
  subject.notify('X');
  unsubscribe();
  subject.notify('X');
  assert.equal(count, 1);
});

test('one failing observer does not stop the others', (t) => {
  t.mock.method(console, 'error', () => {});
  const subject = new Subject();
  let reached = false;
  subject.subscribe({ update: () => { throw new Error('boom'); } });
  subject.subscribe({ update: () => { reached = true; } });
  assert.doesNotThrow(() => subject.notify('X'));
  assert.equal(reached, true);
});

// ---- BroadcastObserver -------------------------------------------------------------
test('broadcast: a public bid updates everybody and appears in the room', () => {
  const manager = fakeManager();
  new BroadcastObserver(manager).update('BID_PLACED', bidEvent());
  assert.deepEqual(manager.calls.map((c) => [c.to, c.type]), [
    ['all', 'AUCTION_UPDATED'],
    ['room:5', 'NEW_BID'],
  ]);
});

test('broadcast: a sealed bid is never announced with its amount', () => {
  const manager = fakeManager();
  new BroadcastObserver(manager).update('BID_PLACED', bidEvent({ bidsArePublic: false }));
  assert.deepEqual(manager.calls.map((c) => c.type), ['AUCTION_UPDATED']);
  assert.ok(!JSON.stringify(manager.calls).includes('150')); // the amount does not leak
});

test('broadcast: the end of an auction reveals the bids to the room', () => {
  const manager = fakeManager();
  const bids = [{ id: 1, username: 'bob', amount: 100 }];
  new BroadcastObserver(manager).update('AUCTION_ENDED', { auctionId: 5, auction: summary, bids });
  const ended = manager.calls.find((c) => c.type === 'AUCTION_ENDED');
  assert.equal(ended.to, 'room:5');
  assert.deepEqual(ended.payload.bids, bids);
});

// ---- OutbidObserver ----------------------------------------------------------------
test('outbid: the previous leader is told privately', () => {
  const manager = fakeManager();
  new OutbidObserver(manager).update('BID_PLACED', bidEvent());
  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].to, 'user:2');
  assert.equal(manager.calls[0].type, 'OUTBID');
  assert.equal(manager.calls[0].payload.by, 'carol');
});

test('outbid: nobody is notified for a first bid, a sealed bid, or other events', () => {
  const manager = fakeManager();
  const observer = new OutbidObserver(manager);
  observer.update('BID_PLACED', bidEvent({ previousTop: null }));
  observer.update('BID_PLACED', bidEvent({ bidsArePublic: false }));
  observer.update('BID_PLACED', bidEvent({ bidderId: 2 })); // same person as the previous leader
  observer.update('AUCTION_ENDED', {});
  assert.equal(manager.calls.length, 0);
});
