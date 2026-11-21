// STRATEGY pattern: the common interface.
// An auction does not know HOW bids are checked or HOW the winner is chosen:
// it asks its strategy. Adding a new auction type = adding one new class,
// without touching the controller (open/closed principle).
//
// `now` (a timestamp in ms) is always passed in, never read inside the strategy,
// so a strategy is a pure function of its inputs and easy to test.
const notImplemented = (method) => {
  throw new Error(`${method}() must be implemented by the strategy`);
};

class BiddingStrategy {
  get name() { return notImplemented('name'); }
  get label() { return notImplemented('label'); }
  get description() { return notImplemented('description'); }

  // Can everybody see every bid while the auction is running?
  get bidsArePublic() { return notImplemented('bidsArePublic'); }

  // Does the auction end the moment somebody bids? (Dutch auction: yes.)
  get endsOnFirstBid() { return false; }

  // Smallest amount that would be accepted right now.
  minimumBid(auction, topAmount, now) { return notImplemented('minimumBid'); }

  // The price shown to everybody (null = hidden).
  publicPrice(auction, topAmount, now) { return notImplemented('publicPrice'); }

  // Throws an AppError when the bid is not allowed.
  validateBid({ auction, bids, user, amount, now }) { return notImplemented('validateBid'); }

  // The amount that is really recorded. Normally what the bidder typed;
  // in a Dutch auction it is the current price, whatever the browser sent.
  resolveAmount({ auction, amount, now }) { return amount; }

  // Returns the winning bid, or null when nobody bid.
  determineWinner(auction, bids) { return notImplemented('determineWinner'); }

  // Which bids may this viewer see?
  visibleBids(auction, bids, viewerId) { return notImplemented('visibleBids'); }
}

module.exports = BiddingStrategy;
