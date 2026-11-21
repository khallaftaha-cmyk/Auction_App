// WebSocket middleware pipeline, tested with a fake socket and a fake controller. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const compose = require('../src/middleware/pipeline');
const { createPipeline } = require('../src/middleware');

function fakeSocket() {
  return { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); } };
}

function fakeController(calls = []) {
  const record = (name, reply) => async (...args) => { calls.push({ name, args }); return reply; };
  return {
    login: async (ws, payload) => {
      calls.push({ name: 'login', args: [payload] });
      ws.user = { id: 1, username: payload.username };
      return { type: 'LOGGED_IN', payload: { user: ws.user } };
    },
    listAuctions: record('listAuctions', { type: 'AUCTION_LIST', payload: { auctions: [] } }),
    joinAuction: record('joinAuction', { type: 'AUCTION_STATE', payload: {} }),
    leaveAuction: record('leaveAuction'),
    createAuction: record('createAuction', { type: 'AUCTION_CREATED_OK', payload: {} }),
    placeBid: record('placeBid', { type: 'BID_ACCEPTED', payload: {} }),
  };
}

function setup(t, controller = fakeController()) {
  t.mock.method(console, 'log', () => {}); // silence the logger middleware
  const run = createPipeline(controller);
  const ws = fakeSocket();
  const send = (message) => run({ ws, raw: typeof message === 'string' ? message : JSON.stringify(message) });
  const login = () => send({ type: 'LOGIN', payload: { username: 'taher' } });
  return { ws, send, login, controller };
}

const lastError = (ws) => ws.sent.findLast((m) => m.type === 'ERROR')?.payload;

// ---- compose() itself -------------------------------------------------------------
test('compose runs middlewares in order, and code after next() runs on the way back', async () => {
  const order = [];
  const run = compose([
    async (ctx, next) => { order.push('a in'); await next(); order.push('a out'); },
    async (ctx, next) => { order.push('b in'); await next(); order.push('b out'); },
    async () => { order.push('end'); },
  ]);
  await run({});
  assert.deepEqual(order, ['a in', 'b in', 'end', 'b out', 'a out']);
});

test('compose stops the chain when a middleware does not call next()', async () => {
  const order = [];
  const run = compose([async () => order.push('stopper'), async () => order.push('never')]);
  await run({});
  assert.deepEqual(order, ['stopper']);
});

test('compose rejects when next() is called twice', async () => {
  const run = compose([async (ctx, next) => { await next(); await next(); }, async () => {}]);
  await assert.rejects(run({}), /twice/);
});

// ---- bad input ---------------------------------------------------------------------
test('invalid JSON is rejected with INVALID_JSON', async (t) => {
  const { ws, send } = setup(t);
  await send('this is not json');
  assert.equal(lastError(ws).code, 'INVALID_JSON');
});

test('a message without a type is rejected', async (t) => {
  const { ws, send } = setup(t);
  await send({ payload: {} });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE');
  await send([1, 2, 3]);
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE');
});

test('unknown types are rejected, including inherited object keys', async (t) => {
  const { ws, send } = setup(t);
  for (const type of ['HACK', 'constructor', '__proto__', 'toString']) {
    await send({ type, payload: {} });
    assert.equal(lastError(ws).code, 'UNKNOWN_TYPE', type);
  }
});

test('invalid payloads never reach the controller', async (t) => {
  const calls = [];
  const { send, login } = setup(t, fakeController(calls));
  await login();
  calls.length = 0;

  const bad = [
    { auctionId: 1, amount: 1.5 },
    { auctionId: 1, amount: '100' },
    { auctionId: 1, amount: -5 },
    { auctionId: 1, amount: 2_000_000_000 },
    { auctionId: 'abc', amount: 100 },
    { amount: 100 },
  ];
  for (const payload of bad) await send({ type: 'PLACE_BID', payload });
  assert.equal(calls.length, 0);
});

// ---- authentication ---------------------------------------------------------------
test('everything except LOGIN requires a login first', async (t) => {
  const calls = [];
  const { ws, send } = setup(t, fakeController(calls));
  await send({ type: 'LIST_AUCTIONS' });
  assert.equal(lastError(ws).code, 'AUTH_REQUIRED');
  assert.equal(calls.length, 0);
});

test('login cleans the username and replies LOGGED_IN', async (t) => {
  const calls = [];
  const { ws, send } = setup(t, fakeController(calls));
  await send({ type: 'LOGIN', payload: { username: '  Taher    B  ' } });
  assert.deepEqual(calls[0].args[0], { username: 'Taher B' });
  assert.equal(ws.sent.at(-1).type, 'LOGGED_IN');
});

test('usernames with HTML or odd characters are rejected', async (t) => {
  const { ws, send } = setup(t);
  await send({ type: 'LOGIN', payload: { username: '<script>alert(1)</script>' } });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE');
  await send({ type: 'LOGIN', payload: { username: 'x' } });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE');
});

test('a second LOGIN on the same connection is rejected', async (t) => {
  const { ws, send, login } = setup(t);
  await login();
  await login();
  assert.equal(lastError(ws).code, 'ALREADY_LOGGED_IN');
});

// ---- routing ------------------------------------------------------------------------
test('a valid bid is routed to controller.placeBid and the reply is sent back', async (t) => {
  const calls = [];
  const { ws, send, login } = setup(t, fakeController(calls));
  await login();
  await send({ type: 'PLACE_BID', payload: { auctionId: 7, amount: 150, isAdmin: true } });
  const call = calls.find((c) => c.name === 'placeBid');
  assert.deepEqual(call.args[1], { auctionId: 7, amount: 150 }); // unknown fields are stripped
  assert.equal(ws.sent.at(-1).type, 'BID_ACCEPTED');
});

test('CREATE_AUCTION is validated and gets defaults', async (t) => {
  const calls = [];
  const { ws, send, login } = setup(t, fakeController(calls));
  await login();

  await send({ type: 'CREATE_AUCTION', payload: { title: 'Bike', strategy: 'dutch', startPrice: 10, durationSeconds: 60 } });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE'); // unknown auction type

  await send({ type: 'CREATE_AUCTION', payload: { title: 'Bike', startPrice: 10, strategy: 'english', durationSeconds: 5 } });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE'); // too short

  await send({ type: 'CREATE_AUCTION', payload: { title: '  Old   bike ', startPrice: 10, strategy: 'english', durationSeconds: 60 } });
  const created = calls.find((c) => c.name === 'createAuction').args[1];
  assert.deepEqual(created, {
    title: 'Old bike',
    description: '',
    strategy: 'english',
    startPrice: 10,
    minIncrement: 1,
    floorPrice: null,
    durationSeconds: 60,
  });
});

test('CREATE_AUCTION: a Dutch auction needs a lowest price, the others ignore it', async (t) => {
  const calls = [];
  const { ws, send, login } = setup(t, fakeController(calls));
  await login();

  await send({ type: 'CREATE_AUCTION', payload: { title: 'Bike', strategy: 'dutch', startPrice: 500, durationSeconds: 60 } });
  assert.equal(lastError(ws).code, 'INVALID_MESSAGE'); // no lowest price
  assert.equal(calls.filter((c) => c.name === 'createAuction').length, 0);

  await send({ type: 'CREATE_AUCTION', payload: { title: 'Bike', strategy: 'dutch', startPrice: 500, floorPrice: 100, durationSeconds: 60 } });
  await send({ type: 'CREATE_AUCTION', payload: { title: 'Bike', strategy: 'sealed', startPrice: 500, floorPrice: 100, durationSeconds: 60 } });
  const [dutch, sealed] = calls.filter((c) => c.name === 'createAuction').map((c) => c.args[1]);
  assert.equal(dutch.floorPrice, 100);
  assert.equal(sealed.floorPrice, null);
});

// ---- errors and limits ---------------------------------------------------------------
test('unexpected errors are hidden behind a generic message', async (t) => {
  t.mock.method(console, 'error', () => {});
  const controller = fakeController();
  controller.listAuctions = async () => { throw new Error('SELECT * FROM secret_table failed'); };
  const { ws, send, login } = setup(t, controller);
  await login();
  await send({ type: 'LIST_AUCTIONS' });
  assert.equal(lastError(ws).code, 'SERVER_ERROR');
  assert.ok(!lastError(ws).message.includes('secret_table'));
});

test('flooding a connection triggers RATE_LIMITED', async (t) => {
  const { ws, send, login } = setup(t);
  await login();
  for (let i = 0; i < 30; i++) await send({ type: 'LIST_AUCTIONS' });
  assert.ok(ws.sent.some((m) => m.type === 'ERROR' && m.payload.code === 'RATE_LIMITED'));
});
