// Factory Method pattern: one creator per auction type. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const AuctionCreator = require('../src/patterns/factory/AuctionCreator');
const { getCreator, getStrategy, STRATEGY_NAMES } = require('../src/patterns/factory');
const EnglishAuctionStrategy = require('../src/patterns/strategy/EnglishAuctionStrategy');
const SealedBidStrategy = require('../src/patterns/strategy/SealedBidStrategy');
const DutchAuctionStrategy = require('../src/patterns/strategy/DutchAuctionStrategy');

const NOW = 1_700_000_000_000;
const input = { title: 'Bike', description: 'Red', startPrice: 200, minIncrement: 25, floorPrice: null, durationSeconds: 120 };

test('every auction type has a creator, and its factory method makes the right strategy', () => {
  assert.deepEqual(STRATEGY_NAMES, ['english', 'sealed', 'dutch']);
  assert.ok(getCreator('english').createStrategy() instanceof EnglishAuctionStrategy);
  assert.ok(getCreator('sealed').createStrategy() instanceof SealedBidStrategy);
  assert.ok(getCreator('dutch').createStrategy() instanceof DutchAuctionStrategy);
});

test('getStrategy goes through the factory and returns a strategy of the right type', () => {
  for (const type of STRATEGY_NAMES) assert.equal(getStrategy(type).name, type);
});

test('unknown types are refused, including inherited object keys', () => {
  assert.throws(() => getCreator('vickrey'), { code: 'BAD_STRATEGY' });
  assert.throws(() => getCreator('constructor'), { code: 'BAD_STRATEGY' });
  assert.throws(() => getStrategy('__proto__'), { code: 'BAD_STRATEGY' });
});

test('english: the record carries the minimum raise and the time window', () => {
  const { record, strategy } = getCreator('english').build({ ...input }, 7, NOW);
  assert.equal(strategy.name, 'english');
  assert.deepEqual(record, {
    title: 'Bike', description: 'Red', strategy: 'english', startPrice: 200,
    startsAt: NOW, endsAt: NOW + 120_000, createdBy: 7, minIncrement: 25, floorPrice: null,
  });
});

test('sealed: no minimum raise and no lowest price', () => {
  const { record } = getCreator('sealed').build({ ...input }, 7, NOW);
  assert.equal(record.strategy, 'sealed');
  assert.equal(record.minIncrement, 1);
  assert.equal(record.floorPrice, null);
});

test('dutch: the record carries the lowest price', () => {
  const { record } = getCreator('dutch').build({ ...input, floorPrice: 80 }, 7, NOW);
  assert.equal(record.strategy, 'dutch');
  assert.equal(record.floorPrice, 80);
  assert.equal(record.startsAt, NOW);
});

test('dutch: the lowest price must exist and be below the starting price', () => {
  const dutch = getCreator('dutch');
  assert.throws(() => dutch.build({ ...input, floorPrice: null }, 7, NOW), { code: 'INVALID_AUCTION' });
  assert.throws(() => dutch.build({ ...input, floorPrice: 200 }, 7, NOW), { code: 'INVALID_AUCTION' });
  assert.throws(() => dutch.build({ ...input, floorPrice: 500 }, 7, NOW), { code: 'INVALID_AUCTION' });
  assert.doesNotThrow(() => dutch.build({ ...input, floorPrice: 199 }, 7, NOW));
});

test('build() is a template: it calls the factory method of whichever subclass it runs on', () => {
  class CustomCreator extends AuctionCreator {
    createStrategy() { return { name: 'custom' }; }
  }
  const { record, strategy } = new CustomCreator().build({ ...input }, 1, NOW);
  assert.equal(strategy.name, 'custom');
  assert.equal(record.strategy, 'custom');
});

test('the base creator leaves the factory method to its subclasses', () => {
  assert.throws(() => new AuctionCreator().build({ ...input }, 1, NOW), /createStrategy\(\) must be implemented/);
});
