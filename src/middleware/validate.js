// Step 5: checks AND cleans the payload of each message type.
// After this step, controllers can trust their input: right types, right ranges, trimmed text.
const AppError = require('../utils/AppError');
const { STRATEGY_NAMES } = require('../patterns/factory');

const MAX_MONEY = 1_000_000_000;
const MAX_ID = 2_147_483_647;

const bad = (message) => new AppError('INVALID_MESSAGE', message);

function text(value, field, { min = 1, max, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw bad(`${field} is required.`);
  }
  if (typeof value !== 'string') throw bad(`${field} must be text.`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min) throw bad(`${field} is too short (minimum ${min} characters).`);
  if (clean.length > max) throw bad(`${field} is too long (maximum ${max} characters).`);
  return clean;
}

function integer(value, field, { min, max, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value)) throw bad(`${field} must be a whole number.`);
  if (value < min || value > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return value;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw bad(`${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function username(value) {
  const clean = text(value, 'Username', { min: 2, max: 20 });
  if (!/^[\p{L}\p{N} _.-]+$/u.test(clean)) {
    throw bad('Username can only contain letters, numbers, spaces, "_", "." and "-".');
  }
  return clean;
}

const auctionId = (value) => integer(value, 'Auction', { min: 1, max: MAX_ID });

// One rule per message type. This table is also the list of messages the server understands.
const rules = {
  LOGIN: (p) => ({ username: username(p.username) }),
  LIST_AUCTIONS: () => ({}),
  JOIN_AUCTION: (p) => ({ auctionId: auctionId(p.auctionId) }),
  LEAVE_AUCTION: () => ({}),
  CREATE_AUCTION: (p) => ({
    title: text(p.title, 'Title', { max: 100 }),
    description: text(p.description, 'Description', { max: 500, optional: true }),
    strategy: oneOf(p.strategy, 'Auction type', STRATEGY_NAMES),
    startPrice: integer(p.startPrice, 'Starting price', { min: 1, max: MAX_MONEY }),
    minIncrement: integer(p.minIncrement, 'Minimum increment', { min: 1, max: MAX_MONEY, fallback: 1 }),
    // Only a Dutch auction has a lowest price; for the other types it is ignored.
    floorPrice: p.strategy === 'dutch' ? integer(p.floorPrice, 'Lowest price', { min: 1, max: MAX_MONEY }) : null,
    durationSeconds: integer(p.durationSeconds, 'Duration', { min: 30, max: 86400 }),
  }),
  PLACE_BID: (p) => ({
    auctionId: auctionId(p.auctionId),
    amount: integer(p.amount, 'Bid', { min: 1, max: MAX_MONEY }),
  }),
};

module.exports = async function validate(ctx, next) {
  const { type, payload } = ctx.message;

  if (!Object.hasOwn(rules, type)) {
    throw new AppError('UNKNOWN_TYPE', `Unknown message type "${type.slice(0, 30)}".`);
  }

  ctx.message.payload = rules[type](payload);
  await next();
};

module.exports.rules = rules;
