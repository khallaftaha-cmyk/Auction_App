// The factory "catalogue": the ONE place that knows which auction types exist.
// To add a type: write a creator + a strategy, then add one line below.
const AppError = require('../../utils/AppError');
const EnglishAuctionCreator = require('./EnglishAuctionCreator');
const SealedAuctionCreator = require('./SealedAuctionCreator');
const DutchAuctionCreator = require('./DutchAuctionCreator');

const creators = {
  english: new EnglishAuctionCreator(),
  sealed: new SealedAuctionCreator(),
  dutch: new DutchAuctionCreator(),
};

const STRATEGY_NAMES = Object.keys(creators);

function getCreator(type) {
  if (!Object.hasOwn(creators, type)) {
    throw new AppError('BAD_STRATEGY', `Unknown auction type "${String(type).slice(0, 30)}".`);
  }
  return creators[type];
}

// Strategies are produced by the factory method too, so nobody else needs to know the classes.
function getStrategy(type) {
  return getCreator(type).createStrategy();
}

module.exports = { getCreator, getStrategy, STRATEGY_NAMES };
