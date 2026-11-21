// Classic auction: open bids, each bid must beat the previous one, highest bid wins.
const BiddingStrategy = require('./BiddingStrategy');
const AppError = require('../../utils/AppError');
const { highestBid } = require('../../utils/bids');

class EnglishAuctionStrategy extends BiddingStrategy {
  get name() { return 'english'; }
  get label() { return 'English (open bids)'; }
  get description() { return 'Everyone sees every bid. Each bid must beat the last one.'; }
  get bidsArePublic() { return true; }

  minimumBid(auction, topAmount) {
    return topAmount == null ? auction.startPrice : topAmount + auction.minIncrement;
  }

  publicPrice(auction, topAmount) {
    return topAmount ?? auction.startPrice;
  }

  validateBid({ auction, bids, user, amount }) {
    const top = highestBid(bids);
    if (top && top.userId === user.id) {
      throw new AppError('ALREADY_LEADING', 'You already have the highest bid.');
    }
    const minimum = this.minimumBid(auction, top ? top.amount : null);
    if (amount < minimum) {
      throw new AppError('BID_TOO_LOW', `Your bid must be at least ${minimum}.`);
    }
  }

  determineWinner(auction, bids) {
    return highestBid(bids);
  }

  visibleBids(auction, bids) {
    return bids;
  }
}

module.exports = EnglishAuctionStrategy;
