// Sealed-bid auction: one secret bid per person, revealed only when the auction ends.
// The highest bid wins (on a tie, the earliest bid wins).
const BiddingStrategy = require('./BiddingStrategy');
const AppError = require('../../utils/AppError');
const { highestBid } = require('../../utils/bids');

class SealedBidStrategy extends BiddingStrategy {
  get name() { return 'sealed'; }
  get label() { return 'Sealed bid'; }
  get description() { return 'One secret bid each. All bids are revealed at the end.'; }
  get bidsArePublic() { return false; }

  minimumBid(auction) {
    return auction.startPrice;
  }

  publicPrice(auction, topAmount) {
    return auction.status === 'closed' ? topAmount : null;
  }

  validateBid({ auction, bids, user, amount }) {
    if (bids.some((bid) => bid.userId === user.id)) {
      throw new AppError('ALREADY_BID', 'Sealed auction: you only get one bid.');
    }
    if (amount < auction.startPrice) {
      throw new AppError('BID_TOO_LOW', `Your bid must be at least ${auction.startPrice}.`);
    }
  }

  determineWinner(auction, bids) {
    return highestBid(bids);
  }

  visibleBids(auction, bids, viewerId) {
    if (auction.status === 'closed') return bids;
    return bids.filter((bid) => bid.userId === viewerId); // you only ever see your own bid
  }
}

module.exports = SealedBidStrategy;
