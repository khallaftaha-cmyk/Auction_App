// Dutch auction: the price starts HIGH and falls in a straight line down to a lowest price.
// The first person to accept the current price wins, and the auction ends at once.
// If nobody accepts before the end time, the item is not sold.
const BiddingStrategy = require('./BiddingStrategy');
const AppError = require('../../utils/AppError');

// The price at a given moment. The browser uses the SAME formula (public/js/pricing.js)
// to animate the falling price; a test checks that both give identical numbers.
// The server stays the only judge: it recomputes the price when someone accepts.
function dutchPrice({ startPrice, floorPrice, startsAt, endsAt }, now) {
  if (now <= startsAt) return startPrice;
  if (now >= endsAt) return floorPrice;
  const progress = (now - startsAt) / (endsAt - startsAt);
  return Math.max(floorPrice, Math.round(startPrice - (startPrice - floorPrice) * progress));
}

class DutchAuctionStrategy extends BiddingStrategy {
  get name() { return 'dutch'; }
  get label() { return 'Dutch (falling price)'; }
  get description() { return 'The price falls over time. The first person to accept it wins.'; }
  get bidsArePublic() { return true; }
  get endsOnFirstBid() { return true; }

  minimumBid(auction, topAmount, now) {
    return dutchPrice(auction, now);
  }

  publicPrice(auction, topAmount, now) {
    return auction.status === 'closed' ? auction.winningAmount : dutchPrice(auction, now);
  }

  // The buyer pays the server's price at the moment of acceptance.
  resolveAmount({ auction, now }) {
    return dutchPrice(auction, now);
  }

  validateBid({ auction, bids, amount, now }) {
    if (bids.length > 0) {
      throw new AppError('ALREADY_SOLD', 'Someone already accepted the price.');
    }
    // `amount` is the price the buyer SAW. The price only falls, so a buyer who saw a higher
    // price than the current one is fine (they pay less). Seeing a lower one means a stale screen.
    if (amount < dutchPrice(auction, now)) {
      throw new AppError('PRICE_CHANGED', 'The price changed. Check the new price and try again.');
    }
  }

  determineWinner(auction, bids) {
    return bids[0] ?? null;
  }

  visibleBids(auction, bids) {
    return bids;
  }
}

module.exports = DutchAuctionStrategy;
module.exports.dutchPrice = dutchPrice;
