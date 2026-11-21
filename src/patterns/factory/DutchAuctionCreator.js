const AuctionCreator = require('./AuctionCreator');
const DutchAuctionStrategy = require('../strategy/DutchAuctionStrategy');
const AppError = require('../../utils/AppError');

class DutchAuctionCreator extends AuctionCreator {
  createStrategy() {
    return new DutchAuctionStrategy();
  }

  // A Dutch auction needs a lowest price, and it must be below the starting price.
  validate(input) {
    if (!Number.isInteger(input.floorPrice) || input.floorPrice >= input.startPrice) {
      throw new AppError('INVALID_AUCTION', 'The lowest price must be below the starting price.');
    }
  }

  extraFields(input) {
    return { minIncrement: 1, floorPrice: input.floorPrice };
  }
}

module.exports = DutchAuctionCreator;
