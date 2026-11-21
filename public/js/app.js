// The browser side of the VIEW: draws what the server sends and sends the user's actions back.
// There is no business logic here: the server decides what is allowed.
import { AuctionSocket } from './socket.js';
import { dutchPrice } from './pricing.mjs';

const CURRENCY = 'MAD';
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('en-US').format(n);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// sessionStorage = one name per browser tab, so two tabs can be two different bidders.
const savedName = {
  get() { try { return sessionStorage.getItem('auction-name'); } catch { return null; } },
  set(name) { try { sessionStorage.setItem('auction-name', name); } catch { /* storage blocked: ignore */ } },
  clear() { try { sessionStorage.removeItem('auction-name'); } catch { /* ignore */ } },
};

const state = {
  user: null,            // { id, username } once logged in
  auctions: new Map(),   // id -> auction summary (the lobby)
  tab: 'open',           // lobby tab: 'open' | 'closed'
  room: null,            // { auction, bids } while inside an auction
  clockOffset: 0,        // server time minus browser time, so countdowns match the server
};

const socket = new AuctionSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

// ====================================================================================
// Small helpers
// ====================================================================================
function showView(name) {
  for (const id of ['login', 'lobby', 'room']) $(`${id}-view`).hidden = id !== name;
  $(`${name}-view`).querySelector('h1')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function toast(message, kind = 'info', onClick = null) {
  const box = $('toasts');
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = `toast ${kind}`;
  el.textContent = message; // textContent, never innerHTML: user text can never inject HTML
  if (onClick) {
    el.type = 'button';
    el.addEventListener('click', () => { onClick(); el.remove(); });
  }
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 5000);
}

function setConnection(stateName, text) {
  const el = $('conn');
  el.dataset.state = stateName;
  el.textContent = text;
}

function syncClock(serverTime) {
  if (serverTime) state.clockOffset = serverTime - Date.now();
}

function formatLeft(ms) {
  if (ms <= 0) return 'Closing…';
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const serverNow = () => Date.now() + state.clockOffset;

// The Dutch price falls every moment, so the browser computes it locally with the same formula as the server.
const livePrice = (auction) => dutchPrice(auction, serverNow());

// Runs 4 times a second. It refreshes everything that depends on the clock:
//   [data-ends]  countdown text      [data-bar]  time bars      [data-dutch]  falling prices
function tick() {
  const now = serverNow();
  document.querySelectorAll('[data-ends]').forEach((el) => {
    const left = Number(el.dataset.ends) - now;
    el.textContent = formatLeft(left);
    el.classList.toggle('urgent', left > 0 && left < 30000);
  });
  document.querySelectorAll('[data-bar]').forEach((fill) => {
    const start = Number(fill.dataset.starts);
    const end = Number(fill.dataset.ends);
    const left = Math.min(1, Math.max(0, (end - now) / (end - start)));
    fill.style.width = `${(left * 100).toFixed(1)}%`;
    fill.parentElement.classList.toggle('urgent', end - now < 30000);
  });
  document.querySelectorAll('[data-dutch]').forEach((el) => {
    const auction = state.auctions.get(Number(el.dataset.dutch));
    if (auction?.status === 'open') el.textContent = `${money(livePrice(auction))} ${CURRENCY}`;
  });
  if (state.room?.auction.strategy === 'dutch' && state.room.auction.status === 'open') renderDutchLive();
}
setInterval(tick, 250);

// ====================================================================================
// Lobby
// ====================================================================================
// The second line of a lot card: who is ahead, or how the auction works.
function lotSummary(auction) {
  if (auction.status === 'closed') return plural(auction.bidCount, 'bid');
  if (auction.strategy === 'dutch') return 'Price is falling';
  if (auction.strategy === 'sealed') return `${plural(auction.bidCount, 'sealed bid')} so far`;
  return auction.leader ? `${auction.leader} leads, ${plural(auction.bidCount, 'bid')}` : 'No bids yet';
}

function lotCard(auction) {
  const node = $('lot-template').content.firstElementChild.cloneNode(true);
  node.dataset.status = auction.status;
  node.querySelector('.stub-num').textContent = auction.id;
  node.querySelector('.lot-title').textContent = auction.title;
  const chip = node.querySelector('.type-chip');
  chip.textContent = auction.strategyLabel;
  chip.classList.add(`type-${auction.strategy}`);
  node.querySelector('.lot-seller').textContent = `by ${auction.creator}`;
  node.querySelector('.lot-bids').textContent = lotSummary(auction);

  const price = node.querySelector('.lot-price');
  const time = node.querySelector('.lot-time');
  if (auction.status === 'open') {
    if (auction.strategy === 'dutch') price.dataset.dutch = auction.id; // tick() keeps it falling
    price.textContent = auction.currentPrice === null ? 'Sealed' : `${money(auction.currentPrice)} ${CURRENCY}`;
    time.dataset.ends = auction.endsAt;
    const fill = node.querySelector('.lot-timebar-fill');
    fill.dataset.bar = '';
    fill.dataset.starts = auction.startsAt;
    fill.dataset.ends = auction.endsAt;
  } else if (auction.winner) {
    price.textContent = `${money(auction.winningAmount)} ${CURRENCY}`;
    time.textContent = `Won by ${auction.winner}`;
  } else {
    price.textContent = auction.strategy === 'dutch' ? 'Unsold' : 'No bids';
    time.textContent = 'Ended';
  }
  if (auction.status === 'closed') node.querySelector('.lot-timebar').hidden = true;

  node.querySelector('.lot-open').addEventListener('click', () => {
    socket.send('JOIN_AUCTION', { auctionId: auction.id });
  });
  return node;
}

function renderLobby() {
  const all = [...state.auctions.values()];
  const open = all.filter((a) => a.status === 'open').sort((a, b) => a.endsAt - b.endsAt);
  const closed = all.filter((a) => a.status === 'closed').sort((a, b) => b.endsAt - a.endsAt);

  $('count-open').textContent = `(${open.length})`;
  $('count-closed').textContent = `(${closed.length})`;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.setAttribute('aria-pressed', String(tab.dataset.tab === state.tab));
  });

  const shown = state.tab === 'open' ? open : closed;
  $('lots').replaceChildren(...shown.map(lotCard));

  const empty = $('lots-empty');
  empty.hidden = shown.length > 0;
  $('lots-empty-text').textContent = state.tab === 'open'
    ? 'No open auctions yet. Start one and invite someone to bid.'
    : 'Nothing has ended yet.';
  $('empty-new').hidden = state.tab !== 'open';
  tick();
}

// ====================================================================================
// Auction room
// ====================================================================================
const myName = () => state.user.username;

function renderRoom() {
  const { auction } = state.room;
  $('room-lot').textContent = `Lot ${auction.id}`;
  const type = $('room-type');
  type.textContent = auction.strategyLabel;
  type.className = `chip type-chip type-${auction.strategy}`;
  $('room-help').textContent = auction.strategyHelp;
  $('room-creator').textContent = `Sold by ${auction.creator}`;
  $('room-title').textContent = auction.title;
  $('room-desc').textContent = auction.description;
  $('room-desc').hidden = !auction.description;
  renderPrice(false);
  renderBids();
  renderBidForm();
}

function flashPrice() {
  const panel = $('price-panel');
  panel.classList.remove('flash');
  void panel.offsetWidth; // restart the CSS animation
  panel.classList.add('flash');
}

function renderPrice(flash) {
  const { auction, bids } = state.room;
  const panel = $('price-panel');
  const value = $('price-value');
  const unit = $('price-unit');
  const clock = $('room-clock');
  const dutch = auction.strategy === 'dutch';
  const open = auction.status === 'open';

  $('price-badge').hidden = !(open && auction.strategy === 'english' && auction.leader === myName());
  $('drop').hidden = !(dutch && open);
  // Dutch auctions show the falling track instead of a time bar, and must not be announced by screen readers every 250 ms.
  $('timebar').hidden = dutch || !open;
  document.querySelector('.price').setAttribute('aria-live', dutch ? 'off' : 'polite');

  if (!open) {
    const iWon = auction.winner === myName();
    panel.dataset.state = iWon ? 'won' : 'ended';
    $('price-label').textContent = iWon ? 'You won this lot' : auction.winner ? `Sold to ${auction.winner}` : 'Ended';
    value.textContent = auction.winner ? money(auction.winningAmount) : dutch ? 'Unsold' : 'No bids';
    unit.hidden = !auction.winner;
    $('price-sub').textContent = dutch
      ? (auction.winner ? 'Sold at the first accepted price.' : 'Nobody accepted the price before it reached the lowest price.')
      : `${plural(bids.length, 'bid')} in total`;
    $('clock-label').textContent = 'Status';
    delete clock.dataset.ends;
    clock.classList.remove('urgent');
    clock.textContent = 'Ended';
  } else {
    panel.dataset.state = 'open';
    $('clock-label').textContent = 'Time left';
    clock.dataset.ends = auction.endsAt;
    const fill = $('timebar-fill');
    fill.dataset.bar = '';
    fill.dataset.starts = auction.startsAt;
    fill.dataset.ends = auction.endsAt;

    if (dutch) {
      $('price-label').textContent = 'Price right now';
      unit.hidden = false;
      $('price-sub').textContent = 'The first person to accept wins at the price shown.';
      $('drop-start').textContent = `Start ${money(auction.startPrice)}`;
      $('drop-floor').textContent = `Lowest ${money(auction.floorPrice)}`;
      renderDutchLive();
    } else if (auction.currentPrice === null) {
      $('price-label').textContent = 'Sealed auction';
      value.textContent = 'Hidden';
      unit.hidden = true;
      $('price-sub').textContent = `${plural(auction.bidCount, 'bid')} placed so far`;
    } else {
      $('price-label').textContent = auction.bidCount ? 'Highest bid' : 'Starting price';
      value.textContent = money(auction.currentPrice);
      unit.hidden = false;
      $('price-sub').textContent = auction.bidCount
        ? `${plural(auction.bidCount, 'bid')}, led by ${auction.leader}`
        : 'No bids yet. Be the first.';
    }
  }
  if (flash) flashPrice();
  tick();
}

// Called every tick while a Dutch auction is open: the price, the falling track and the buy button.
function renderDutchLive() {
  const { auction } = state.room;
  const price = livePrice(auction);
  $('price-value').textContent = money(price);
  const range = auction.startPrice - auction.floorPrice;
  $('drop-fill').style.width = `${range > 0 ? ((price - auction.floorPrice) / range) * 100 : 0}%`;
  $('buy-now').textContent = `Buy now for ${money(price)} ${CURRENCY}`;
}

function renderBids(newBidId = null) {
  const { auction, bids } = state.room;
  let rows = bids;
  // When a sealed auction ends, rank the revealed bids from highest to lowest.
  if (auction.strategy === 'sealed' && auction.status === 'closed') {
    rows = [...bids].sort((a, b) => b.amount - a.amount || a.placedAt - b.placedAt);
  }

  const isTop = (bid, index) => auction.status === 'closed'
    ? bid.username === auction.winner && bid.amount === auction.winningAmount
    : auction.strategy === 'english' && index === 0;

  $('bids').replaceChildren(...rows.map((bid, index) => {
    const li = document.createElement('li');
    li.className = 'bid';
    if (bid.username === myName()) li.classList.add('is-me');
    if (isTop(bid, index)) li.classList.add('is-top');
    if (bid.id === newBidId) li.classList.add('is-new');

    const info = document.createElement('span');
    info.className = 'bid-info';
    const who = document.createElement('span');
    who.className = 'bid-who';
    who.textContent = bid.username;
    const time = document.createElement('span');
    time.className = 'bid-time';
    time.textContent = clockTime(bid.placedAt);
    info.append(who, time);

    const amount = document.createElement('span');
    amount.className = 'bid-amount';
    amount.textContent = `${money(bid.amount)} ${CURRENCY}`;

    li.append(info, amount);
    return li;
  }));

  const empty = $('bids-empty');
  empty.hidden = rows.length > 0;
  empty.textContent = auction.strategy === 'sealed' && auction.status === 'open'
    ? 'Bids are hidden until the auction ends. Only your own bid shows here.'
    : auction.strategy === 'dutch' ? 'Nobody has bought yet.' : 'No bids yet.';
}

function renderBidForm() {
  const { auction, bids } = state.room;
  const form = $('bid-form');
  const buy = $('buy-now');
  const hint = $('bid-hint');
  const input = $('bid-amount');
  const quick = $('quick-row');

  const mine = bids.find((bid) => bid.username === myName());
  const leading = auction.strategy === 'english' && auction.leader === myName();
  const isOwner = auction.creator === myName();

  form.hidden = true;
  buy.hidden = true;
  hint.textContent = '';

  if (auction.status === 'closed') return;
  if (isOwner) {
    hint.textContent = 'You are selling this lot, so you cannot bid on it.';
    return;
  }

  if (auction.strategy === 'dutch') {
    buy.hidden = false;
    hint.textContent = 'Buying is final: you pay the price at the moment the server receives your click.';
    renderDutchLive();
    return;
  }

  let locked = false;
  if (auction.strategy === 'sealed') {
    if (mine) {
      locked = true;
      hint.textContent = `Your sealed bid of ${money(mine.amount)} ${CURRENCY} is in. Everyone's bids are revealed when the auction ends.`;
    } else {
      hint.textContent = `One secret bid, minimum ${money(auction.minNextBid)} ${CURRENCY}. You cannot change it afterwards.`;
    }
  } else if (leading) {
    locked = true;
    hint.textContent = 'You have the highest bid. Wait for someone to outbid you.';
  } else {
    hint.textContent = `Minimum bid: ${money(auction.minNextBid)} ${CURRENCY}.`;
  }

  form.hidden = false;
  input.disabled = locked;
  $('bid-submit').disabled = locked;
  input.min = auction.minNextBid;
  input.placeholder = money(auction.minNextBid);

  // Three one-click amounts for English auctions: the minimum, then two bigger raises.
  const steps = auction.strategy === 'english' && !locked
    ? [0, 1, 5].map((n) => auction.minNextBid + n * auction.minIncrement)
    : [];
  quick.replaceChildren(...steps.map((amount) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn quick-bid';
    button.textContent = money(amount);
    button.addEventListener('click', () => placeBid(amount));
    return button;
  }));
  quick.hidden = steps.length === 0;
}

function placeBid(amount) {
  if (!Number.isInteger(amount) || amount < 1) {
    toast('Enter your bid as a whole number.', 'error');
    return;
  }
  if (!socket.send('PLACE_BID', { auctionId: state.room.auction.id, amount })) {
    toast('Not connected. Reconnecting…', 'error');
  }
}

function leaveRoom() {
  socket.send('LEAVE_AUCTION');
  state.room = null;
  renderLobby();
  showView('lobby');
}

// ====================================================================================
// Messages from the server
// ====================================================================================
socket.on('open', () => {
  setConnection('live', 'Live');
  const name = state.user?.username ?? savedName.get();
  if (name) {
    state.user = null; // a new connection starts logged out: log in again
    socket.send('LOGIN', { username: name });
  }
});

socket.on('close', () => setConnection('offline', 'Reconnecting…'));

socket.on('LOGGED_IN', ({ user, serverTime }) => {
  state.user = user;
  savedName.set(user.username);
  syncClock(serverTime);
  $('username').textContent = user.username;
  $('who').hidden = false;

  socket.send('LIST_AUCTIONS');
  if (state.room) {
    socket.send('JOIN_AUCTION', { auctionId: state.room.auction.id }); // came back after a disconnect
  } else {
    showView('lobby');
  }
});

socket.on('AUCTION_LIST', ({ auctions, serverTime }) => {
  syncClock(serverTime);
  state.auctions = new Map(auctions.map((a) => [a.id, a]));
  renderLobby();
});

socket.on('AUCTION_UPDATED', ({ auction }) => {
  const before = state.auctions.get(auction.id);
  state.auctions.set(auction.id, auction);

  if (before?.status === 'open' && auction.status === 'closed' && auction.winner === myName()) {
    toast(`You won "${auction.title}" for ${money(auction.winningAmount)} ${CURRENCY}!`, 'success');
  }
  if (!$('lobby-view').hidden) renderLobby();

  if (state.room?.auction.id === auction.id) {
    state.room.auction = auction;
    renderPrice(auction.status === 'open' && before && before.bidCount !== auction.bidCount);
    renderBidForm();
  }
});

socket.on('AUCTION_CREATED_OK', ({ auctionId }) => {
  socket.send('JOIN_AUCTION', { auctionId });
});

socket.on('AUCTION_STATE', ({ auction, bids, serverTime }) => {
  syncClock(serverTime);
  state.room = { auction, bids };
  state.auctions.set(auction.id, auction);
  renderRoom();
  showView('room');
});

socket.on('NEW_BID', ({ auctionId, bid }) => {
  if (state.room?.auction.id !== auctionId) return;
  if (state.room.bids.some((b) => b.id === bid.id)) return;
  state.room.bids.unshift(bid);
  renderBids(bid.id);
  renderBidForm();
});

socket.on('BID_ACCEPTED', ({ auctionId, bid }) => {
  const dutch = state.room?.auction.strategy === 'dutch' && state.room.auction.id === auctionId;
  if (!dutch) toast(`Bid of ${money(bid.amount)} ${CURRENCY} placed.`, 'success'); // the Dutch win toast comes from AUCTION_UPDATED
  $('bid-amount').value = '';
  if (state.room?.auction.id === auctionId && !state.room.bids.some((b) => b.id === bid.id)) {
    state.room.bids.unshift(bid); // sealed auctions: this is how you see your own bid
    renderBids(bid.id);
    renderBidForm();
  }
});

socket.on('OUTBID', ({ auctionId, title, amount, by }) => {
  const inThisRoom = state.room?.auction.id === auctionId;
  toast(
    `${by} outbid you on "${title}" with ${money(amount)} ${CURRENCY}.`,
    'warn',
    inThisRoom ? null : () => socket.send('JOIN_AUCTION', { auctionId })
  );
});

socket.on('AUCTION_ENDED', ({ auctionId, auction, bids }) => {
  if (state.room?.auction.id !== auctionId) return;
  state.room.auction = auction;
  state.room.bids = bids;
  renderPrice(true);
  renderBids();
  renderBidForm();
});

socket.on('ERROR', ({ message }) => {
  if (!state.user) {
    $('login-error').textContent = message; // a login problem: show it under the form
  } else {
    toast(message, 'error');
  }
});

// ====================================================================================
// User actions
// ====================================================================================
$('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  $('login-error').textContent = '';
  const username = $('login-name').value.trim();
  if (!username) {
    $('login-error').textContent = 'Type a name to continue.';
    return;
  }
  if (!socket.send('LOGIN', { username })) {
    $('login-error').textContent = 'Not connected yet. Try again in a second.';
  }
});

$('switch-user').addEventListener('click', () => {
  savedName.clear();
  location.reload();
});

$('brand').addEventListener('click', (event) => {
  event.preventDefault();
  if (state.room) leaveRoom();
});

$('back').addEventListener('click', leaveRoom);

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab;
    renderLobby();
  });
});

$('bid-form').addEventListener('submit', (event) => {
  event.preventDefault();
  placeBid($('bid-amount').valueAsNumber);
});

// Dutch: the click sends the price shown 2 seconds ago. That is never below the server's price, so a slightly
// wrong clock cannot make the buy fail, and the server still charges only its own current price.
$('buy-now').addEventListener('click', () => {
  const { auction } = state.room;
  placeBid(dutchPrice(auction, serverNow() - 2000));
});

// ---- create-auction dialog -----------------------------------------------------------
const dialog = $('create-dialog');

function openCreateDialog() {
  $('create-form').reset();
  $('create-error').textContent = '';
  delete $('c-floor').dataset.touched;
  syncTypeFields();
  dialog.showModal();
  $('c-title').focus();
}
$('new-auction').addEventListener('click', openCreateDialog);
$('empty-new').addEventListener('click', openCreateDialog);

$('create-cancel').addEventListener('click', () => dialog.close());

// Each auction type needs different fields: English has a minimum raise, Dutch has a lowest price.
function syncTypeFields() {
  const strategy = $('create-form').elements.strategy.value;
  $('c-increment-field').hidden = strategy !== 'english';
  $('c-floor-field').hidden = strategy !== 'dutch';
  $('c-start-label').textContent = strategy === 'dutch' ? 'Highest price (MAD)' : 'Starting price (MAD)';
  if (strategy === 'dutch' && !$('c-floor').dataset.touched) {
    $('c-floor').value = Math.max(1, Math.round(($('c-start').valueAsNumber || 100) / 2));
  }
}
$('c-start').addEventListener('input', syncTypeFields); // the suggested lowest price follows the highest price
$('c-floor').addEventListener('input', () => { $('c-floor').dataset.touched = '1'; });
document.querySelectorAll('input[name="strategy"]').forEach((radio) => {
  radio.addEventListener('change', syncTypeFields);
});

$('create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const payload = {
    title: $('c-title').value,
    description: $('c-desc').value,
    strategy: $('create-form').elements.strategy.value,
    startPrice: $('c-start').valueAsNumber,
    minIncrement: $('c-increment').valueAsNumber || 1,
    durationSeconds: Number($('c-duration').value),
  };
  if (payload.strategy === 'dutch') payload.floorPrice = $('c-floor').valueAsNumber;
  if (!payload.title.trim()) {
    $('create-error').textContent = 'Give your auction a title.';
    return;
  }
  if (!Number.isInteger(payload.startPrice) || payload.startPrice < 1) {
    $('create-error').textContent = 'The starting price must be a whole number, 1 or more.';
    return;
  }
  if (payload.strategy === 'dutch' && !(Number.isInteger(payload.floorPrice) && payload.floorPrice >= 1 && payload.floorPrice < payload.startPrice)) {
    $('create-error').textContent = 'The lowest price must be a whole number below the highest price.';
    return;
  }
  if (!socket.send('CREATE_AUCTION', payload)) {
    $('create-error').textContent = 'Not connected. Try again in a second.';
    return;
  }
  dialog.close();
});

// ====================================================================================
socket.connect();
