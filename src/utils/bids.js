// Bids are always loaded oldest-first, so on a tie the earliest bid keeps the lead.
function highestBid(bids) {
  let best = null;
  for (const bid of bids) {
    if (!best || bid.amount > best.amount) best = bid;
  }
  return best;
}

// What a bid looks like when it is sent to a browser (no internal ids leak out).
function publicBid(bid) {
  return {
    id: bid.id,
    username: bid.username,
    amount: bid.amount,
    placedAt: bid.placedAt,
  };
}

module.exports = { highestBid, publicBid };
