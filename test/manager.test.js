// Singleton pattern: AuctionManager (rooms, per-auction queue, timers). No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const AuctionManager = require('../src/patterns/singleton/AuctionManager');

const manager = AuctionManager.getInstance();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeSocket(user = null) {
  return { readyState: 1, user, roomId: null, sent: [], send(data) { this.sent.push(JSON.parse(data)); } };
}

// ---- Singleton ---------------------------------------------------------------------
test('getInstance always returns the same object, and "new" is refused', () => {
  assert.equal(AuctionManager.getInstance(), manager);
  assert.throws(() => new AuctionManager(), /singleton/);
});

// ---- Rooms -------------------------------------------------------------------------
test('room broadcasts only reach the people in that room', () => {
  const a = fakeSocket({ id: 1 });
  const b = fakeSocket({ id: 2 });
  const outsider = fakeSocket({ id: 3 });
  [a, b, outsider].forEach((ws) => manager.addClient(ws));
  manager.join(10, a);
  manager.join(10, b);

  manager.broadcastRoom(10, 'NEW_BID', { amount: 5 });
  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 1);
  assert.equal(outsider.sent.length, 0);
  [a, b, outsider].forEach((ws) => manager.removeClient(ws));
});

test('joining a second auction leaves the first one', () => {
  const ws = fakeSocket({ id: 1 });
  manager.addClient(ws);
  manager.join(20, ws);
  manager.join(21, ws);
  manager.broadcastRoom(20, 'X', {});
  manager.broadcastRoom(21, 'Y', {});
  assert.deepEqual(ws.sent.map((m) => m.type), ['Y']);
  manager.removeClient(ws);
});

test('a removed client receives nothing any more', () => {
  const ws = fakeSocket({ id: 1 });
  manager.addClient(ws);
  manager.join(30, ws);
  manager.removeClient(ws);
  manager.broadcastRoom(30, 'X', {});
  manager.broadcastAll('X', {});
  assert.equal(ws.sent.length, 0);
});

test('broadcastAll skips connections that are not logged in', () => {
  const loggedIn = fakeSocket({ id: 1 });
  const anonymous = fakeSocket(null);
  manager.addClient(loggedIn);
  manager.addClient(anonymous);
  manager.broadcastAll('AUCTION_UPDATED', {});
  assert.equal(loggedIn.sent.length, 1);
  assert.equal(anonymous.sent.length, 0);
  manager.removeClient(loggedIn);
  manager.removeClient(anonymous);
});

test('sendToUser reaches every tab of that user and nobody else', () => {
  const tab1 = fakeSocket({ id: 7 });
  const tab2 = fakeSocket({ id: 7 });
  const other = fakeSocket({ id: 8 });
  [tab1, tab2, other].forEach((ws) => manager.addClient(ws));
  manager.sendToUser(7, 'OUTBID', {});
  assert.equal(tab1.sent.length, 1);
  assert.equal(tab2.sent.length, 1);
  assert.equal(other.sent.length, 0);
  [tab1, tab2, other].forEach((ws) => manager.removeClient(ws));
});

// ---- runExclusive: the protection against simultaneous bids -------------------------------
test('runExclusive runs tasks of the same auction one after another, never overlapping', async () => {
  const log = [];
  const task = (name, ms) => async () => {
    log.push(`${name} start`);
    await sleep(ms);
    log.push(`${name} end`);
    return name;
  };

  const results = await Promise.all([
    manager.runExclusive(1, task('A', 30)),
    manager.runExclusive(1, task('B', 5)),
    manager.runExclusive(1, task('C', 5)),
  ]);

  assert.deepEqual(results, ['A', 'B', 'C']);
  assert.deepEqual(log, ['A start', 'A end', 'B start', 'B end', 'C start', 'C end']);
});

test('runExclusive: a failing task does not block the next one', async () => {
  const failing = manager.runExclusive(2, async () => { throw new Error('nope'); });
  const next = manager.runExclusive(2, async () => 'ok');
  await assert.rejects(failing, /nope/);
  assert.equal(await next, 'ok');
});

test('runExclusive: different auctions do not wait for each other', async () => {
  const log = [];
  await Promise.all([
    manager.runExclusive(3, async () => { await sleep(40); log.push('slow'); }),
    manager.runExclusive(4, async () => { log.push('fast'); }),
  ]);
  assert.deepEqual(log, ['fast', 'slow']);
});

// ---- Timers --------------------------------------------------------------------------
test('scheduleClose fires at the end time, and clearTimer cancels it', async () => {
  let fired = 0;
  manager.scheduleClose(50, Date.now() + 20, () => fired++);
  manager.scheduleClose(51, Date.now() + 20, () => fired += 100);
  manager.clearTimer(51);
  await sleep(60);
  assert.equal(fired, 1);
});
