// End-to-end smoke test: real WebSocket clients talking to a RUNNING server (and its MySQL database).
//
//   1. npm start            (in one terminal)
//   2. npm run smoke        (in another)
//
// It creates a few test users and auctions, so run it against your development database.
// It takes about 35 seconds because auctions last at least 30 seconds.
const WebSocket = require('ws');

const URL = process.env.URL || `ws://localhost:${process.env.PORT || 3000}/ws`;
const tag = Date.now().toString(36).slice(-5);
let failures = 0;

// ---- tiny test client ------------------------------------------------------------------
function connect(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      const i = waiters.findIndex((w) => w.match(message));
      if (i >= 0) {
        const [waiter] = waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        inbox.push(message);
      }
    });

    const client = {
      label,
      user: null,
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, payload })),
      raw: (text) => ws.send(text),
      close: () => ws.close(),

      // Wait for the first message that matches ANY of the given [type, test] specs.
      // Returns { type, payload }. One single waiter, so nothing is left dangling.
      either(specs, ms = 3000) {
        const match = (m) => specs.some(([type, test = () => true]) => m.type === type && test(m.payload));
        const i = inbox.findIndex(match);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const names = specs.map(([type]) => type).join(' / ');
          const timer = setTimeout(() => rej(new Error(`${label}: timed out waiting for ${names}`)), ms);
          waiters.push({ match, resolve: res, timer });
        });
      },

      // Wait for a message of this type (that also passes `test`). Returns its payload.
      expect: (type, test = () => true, ms = 3000) => client.either([[type, test]], ms).then((m) => m.payload),

      // Wait for an ERROR with this code.
      expectError: (code, ms) => client.expect('ERROR', (p) => p.code === code, ms),

      // Make sure NO such message arrives within `ms`.
      async expectNone(type, test = () => true, ms = 400) {
        await new Promise((r) => setTimeout(r, ms));
        return !inbox.some((m) => m.type === type && test(m.payload));
      },
    };

    ws.on('open', () => resolve(client));
    ws.on('error', (err) => reject(new Error(`Cannot reach ${URL}: ${err.message}. Is "npm start" running?`)));
  });
}

async function login(name) {
  const client = await connect(name);
  client.send('LOGIN', { username: `${name}-${tag}` });
  const { user } = await client.expect('LOGGED_IN');
  client.user = user;
  return client;
}

async function check(description, fn) {
  try {
    const ok = await fn();
    if (ok === false) throw new Error('condition was false');
    console.log(`  ok   ${description}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL ${description}\n       ${err.message}`);
  }
}

const bidOf = (client, auctionId, amount) => client.send('PLACE_BID', { auctionId, amount });

// ---- the scenario -------------------------------------------------------------------------
async function main() {
  console.log(`Smoke test against ${URL}\n`);

  console.log('Bad input');
  const anon = await connect('anon');
  await check('not logged in -> AUTH_REQUIRED', async () => {
    anon.send('LIST_AUCTIONS');
    await anon.expectError('AUTH_REQUIRED');
  });
  await check('invalid JSON -> INVALID_JSON', async () => {
    anon.raw('not json');
    await anon.expectError('INVALID_JSON');
  });
  await check('unknown message type -> UNKNOWN_TYPE', async () => {
    anon.send('constructor');
    await anon.expectError('UNKNOWN_TYPE');
  });
  await check('invalid username -> INVALID_MESSAGE', async () => {
    anon.send('LOGIN', { username: '<b>x</b>' });
    await anon.expectError('INVALID_MESSAGE');
  });
  anon.close();

  // erin only watches the English auction, so she is still in its room when it ends.
  const [alice, bob, carol, dave, erin] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'erin'].map(login));
  console.log('\nEnglish auction');

  alice.send('CREATE_AUCTION', {
    title: `Vintage bike ${tag}`, description: 'Smoke test', strategy: 'english',
    startPrice: 100, minIncrement: 10, durationSeconds: 30,
  });
  const { auctionId: english } = await alice.expect('AUCTION_CREATED_OK');
  await check('everybody gets the new auction in their lobby (AUCTION_UPDATED)', async () => {
    const { auction } = await bob.expect('AUCTION_UPDATED', (p) => p.auction.id === english);
    return auction.status === 'open' && auction.currentPrice === 100;
  });

  for (const client of [alice, bob, carol, dave, erin]) client.send('JOIN_AUCTION', { auctionId: english });
  await Promise.all([alice, bob, carol, dave, erin].map((c) => c.expect('AUCTION_STATE')));

  await check('the seller cannot bid on their own auction', async () => {
    bidOf(alice, english, 500);
    await alice.expectError('OWN_AUCTION');
  });
  await check('a bid below the starting price is rejected', async () => {
    bidOf(bob, english, 50);
    await bob.expectError('BID_TOO_LOW');
  });
  await check('a valid bid is accepted and shown live to the room (NEW_BID)', async () => {
    bidOf(bob, english, 100);
    await bob.expect('BID_ACCEPTED');
    const { bid } = await carol.expect('NEW_BID', (p) => p.auctionId === english);
    return bid.amount === 100 && bid.username === bob.user.username;
  });
  await check('the leader cannot outbid themselves', async () => {
    bidOf(bob, english, 200);
    await bob.expectError('ALREADY_LEADING');
  });
  await check('a bid must beat the leader by the minimum raise', async () => {
    bidOf(carol, english, 105);
    await carol.expectError('BID_TOO_LOW');
  });
  await check('outbidding notifies the previous leader privately (OUTBID)', async () => {
    bidOf(carol, english, 110);
    await carol.expect('BID_ACCEPTED');
    const outbid = await bob.expect('OUTBID', (p) => p.auctionId === english);
    return outbid.by === carol.user.username && outbid.amount === 110;
  });
  await check('...and nobody else gets that OUTBID', () => dave.expectNone('OUTBID'));

  await check('two simultaneous bids: exactly one wins the race', async () => {
    bob.send('PLACE_BID', { auctionId: english, amount: 120 }); // bob regains the lead
    await bob.expect('BID_ACCEPTED');
    // minimum is now 130. Carol and Dave both bid 140 at the same instant.
    bidOf(carol, english, 140);
    bidOf(dave, english, 140);
    const outcome = (client) =>
      client
        .either([['BID_ACCEPTED'], ['ERROR', (p) => p.code === 'BID_TOO_LOW']])
        .then((m) => (m.type === 'BID_ACCEPTED' ? 'accepted' : 'rejected'));
    const results = await Promise.all([outcome(carol), outcome(dave)]);
    const accepted = results.filter((r) => r === 'accepted').length;
    if (accepted !== 1) throw new Error(`expected exactly 1 accepted bid, got ${accepted} (${results})`);
  });

  console.log('\nSealed-bid auction');
  alice.send('CREATE_AUCTION', {
    title: `Sealed laptop ${tag}`, strategy: 'sealed', startPrice: 100, durationSeconds: 30,
  });
  const { auctionId: sealed } = await alice.expect('AUCTION_CREATED_OK');
  for (const client of [alice, bob, carol, dave]) client.send('JOIN_AUCTION', { auctionId: sealed });
  await Promise.all([alice, bob, carol, dave].map((c) => c.expect('AUCTION_STATE', (p) => p.auction.id === sealed)));

  await check('a sealed bid is accepted', async () => {
    bidOf(bob, sealed, 150);
    await bob.expect('BID_ACCEPTED');
  });
  await check('nobody else sees the amount or the price (no NEW_BID, price hidden)', async () => {
    const { auction } = await carol.expect('AUCTION_UPDATED', (p) => p.auction.id === sealed && p.auction.bidCount === 1);
    return auction.currentPrice === null && (await carol.expectNone('NEW_BID', (p) => p.auctionId === sealed));
  });
  await check('only one sealed bid per person', async () => {
    bidOf(bob, sealed, 999);
    await bob.expectError('ALREADY_BID');
  });
  await check('a sealed bid below the starting price is rejected', async () => {
    bidOf(carol, sealed, 90);
    await carol.expectError('BID_TOO_LOW');
  });
  await check('a higher sealed bid from someone else is accepted', async () => {
    bidOf(carol, sealed, 200);
    await carol.expect('BID_ACCEPTED');
  });
  await check('re-entering the room shows only your own bid, not the others', async () => {
    dave.send('JOIN_AUCTION', { auctionId: sealed });
    const daveView = await dave.expect('AUCTION_STATE', (p) => p.auction.id === sealed);
    bob.send('JOIN_AUCTION', { auctionId: sealed });
    const bobView = await bob.expect('AUCTION_STATE', (p) => p.auction.id === sealed);
    return daveView.bids.length === 0 && bobView.bids.length === 1 && bobView.bids[0].username === bob.user.username;
  });

  console.log('\nDutch auction');
  alice.send('CREATE_AUCTION', {
    title: `Dutch camera ${tag}`, strategy: 'dutch', startPrice: 500, floorPrice: 100, durationSeconds: 30,
  });
  const { auctionId: dutch } = await alice.expect('AUCTION_CREATED_OK');
  for (const client of [alice, bob, dave]) client.send('JOIN_AUCTION', { auctionId: dutch });
  const dutchState = await Promise.all([alice, bob, dave].map((c) => c.expect('AUCTION_STATE', (p) => p.auction.id === dutch)));

  await check('the price starts at the highest price and has a lowest price', () => {
    const a = dutchState[1].auction;
    return a.currentPrice <= 500 && a.currentPrice > 450 && a.floorPrice === 100 && a.startPrice === 500;
  });
  await check('the seller cannot buy their own lot', async () => {
    bidOf(alice, dutch, 500);
    await alice.expectError('OWN_AUCTION');
  });
  await check('an offer below the current price is refused (PRICE_CHANGED)', async () => {
    bidOf(bob, dutch, 100);
    await bob.expectError('PRICE_CHANGED');
  });
  await check('two buyers at the same instant: exactly one wins', async () => {
    await new Promise((r) => setTimeout(r, 1000)); // let the price fall a little, so we can see what the buyer pays
    bidOf(bob, dutch, 500);
    bidOf(dave, dutch, 500);
    const outcome = (client) =>
      client
        .either([['BID_ACCEPTED'], ['ERROR', (p) => ['ALREADY_SOLD', 'AUCTION_CLOSED'].includes(p.code)]])
        .then((m) => (m.type === 'BID_ACCEPTED' ? 'bought' : 'refused'));
    const results = await Promise.all([outcome(bob), outcome(dave)]);
    const bought = results.filter((r) => r === 'bought').length;
    if (bought !== 1) throw new Error(`expected exactly 1 buyer, got ${bought} (${results})`);
  });
  await check('the first buyer ends the auction at once, at the server price (not the offer)', async () => {
    const ended = await alice.expect('AUCTION_ENDED', (p) => p.auctionId === dutch, 3000);
    const a = ended.auction;
    return a.status === 'closed' && a.winningAmount < 500 && a.winningAmount >= 100 && ended.bids.length === 1;
  });

  alice.send('CREATE_AUCTION', {
    title: `Dutch unsold ${tag}`, strategy: 'dutch', startPrice: 500, floorPrice: 100, durationSeconds: 30,
  });
  const { auctionId: dutchUnsold } = await alice.expect('AUCTION_CREATED_OK');
  bob.send('JOIN_AUCTION', { auctionId: dutchUnsold });
  await bob.expect('AUCTION_STATE', (p) => p.auction.id === dutchUnsold);

  await check('a Dutch auction needs a lowest price below the highest price', async () => {
    alice.send('CREATE_AUCTION', { title: 'Bad', strategy: 'dutch', startPrice: 100, floorPrice: 100, durationSeconds: 30 });
    await alice.expectError('INVALID_AUCTION');
  });

  console.log('\nRate limiting');
  const spammer = await login('spam');
  await check('flooding the server triggers RATE_LIMITED', async () => {
    for (let i = 0; i < 40; i++) spammer.send('LIST_AUCTIONS');
    await spammer.expectError('RATE_LIMITED');
  });
  spammer.close();

  console.log('\nWaiting for the auctions to end (about 30 seconds)...');
  const endedEnglish = await erin.expect('AUCTION_ENDED', (p) => p.auctionId === english, 45000);
  const endedSealed = await carol.expect('AUCTION_ENDED', (p) => p.auctionId === sealed, 45000);
  const endedUnsold = await bob.expect('AUCTION_ENDED', (p) => p.auctionId === dutchUnsold, 45000);

  console.log('\nResults');
  await check('English: the winner holds the highest bid (140) and all 4 bids are listed', () => {
    const a = endedEnglish.auction;
    return a.status === 'closed' && a.winningAmount === 140 && [carol.user.username, dave.user.username].includes(a.winner)
      && endedEnglish.bids.length === 4;
  });
  await check('Sealed: the highest bid (200, carol) wins and all bids are revealed', () => {
    const a = endedSealed.auction;
    return a.winner === carol.user.username && a.winningAmount === 200 && a.currentPrice === 200 && endedSealed.bids.length === 2;
  });
  await check('Dutch: an auction nobody buys ends with no winner', () => {
    const a = endedUnsold.auction;
    return a.status === 'closed' && a.winner === null && endedUnsold.bids.length === 0;
  });
  await check('the winner is told they won (AUCTION_UPDATED with their name)', async () => {
    await carol.expect('AUCTION_UPDATED', (p) => p.auction.id === sealed && p.auction.status === 'closed' && p.auction.winner === carol.user.username);
  });
  await check('bidding on an ended auction is refused (AUCTION_CLOSED)', async () => {
    bidOf(bob, english, 1000);
    await bob.expectError('AUCTION_CLOSED');
  });
  await check('the ended auctions appear in LIST_AUCTIONS, with their leader', async () => {
    bob.send('LIST_AUCTIONS');
    const { auctions } = await bob.expect('AUCTION_LIST');
    const closed = auctions.filter((a) => [english, sealed, dutch, dutchUnsold].includes(a.id) && a.status === 'closed');
    const sealedRow = auctions.find((a) => a.id === sealed);
    const englishRow = auctions.find((a) => a.id === english);
    return closed.length === 4 && sealedRow.leader === null && englishRow.leader === englishRow.winner;
  });

  [alice, bob, carol, dave, erin].forEach((c) => c.close());

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
