const AuctionCreator = require('./AuctionCreator');
const SealedBidStrategy = require('../strategy/SealedBidStrategy');

class SealedAuctionCreator extends AuctionCreator {
  createStrategy() {
    return new SealedBidStrategy();
  }
  // No minimum raise and no lowest price: the defaults of AuctionCreator are enough.
}

module.exports = SealedAuctionCreator;
