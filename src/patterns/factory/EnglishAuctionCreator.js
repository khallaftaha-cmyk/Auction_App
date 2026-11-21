const AuctionCreator = require('./AuctionCreator');
const EnglishAuctionStrategy = require('../strategy/EnglishAuctionStrategy');

class EnglishAuctionCreator extends AuctionCreator {
  createStrategy() {
    return new EnglishAuctionStrategy();
  }

  // English auctions need a minimum raise.
  extraFields(input) {
    return { minIncrement: input.minIncrement, floorPrice: null };
  }
}

module.exports = EnglishAuctionCreator;
