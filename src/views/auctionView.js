// VIEW (server side): decides exactly what the browser is allowed to see.
// The browser UI in /public draws it, but THIS file is what guarantees that
// a sealed bid is never sent to the wrong person.
const { getStrategy } = require('../patterns/factory');
const { publicBid } = require('../utils/bids');

function summary(auction, now = Date.now()) {
  const strategy = getStrategy(auction.strategy);
  return {
    id: auction.id,
    title: auction.title,
    description: auction.description,
    strategy: auction.strategy,
    strategyLabel: strategy.label,
    strategyHelp: strategy.description,
    startPrice: auction.startPrice,
    minIncrement: auction.minIncrement,
    startsAt: auction.startsAt,
    endsAt: auction.endsAt,
    floorPrice: auction.floorPrice,
    status: auction.status,
    creator: auction.creator,
    bidCount: auction.bidCount,
    currentPrice: strategy.publicPrice(auction, auction.topAmount, now), // null = hidden
    minNextBid: strategy.minimumBid(auction, auction.topAmount, now),
    leader: strategy.bidsArePublic ? auction.leader : null, // a sealed auction never reveals its leader
    winner: auction.winner,
    winningAmount: auction.winningAmount,
  };
}

// What a player receives when entering an auction room.
function detail(auction, bids, viewerId, now = Date.now()) {
  const strategy = getStrategy(auction.strategy);
  const visible = strategy.visibleBids(auction, bids, viewerId);
  return {
    auction: summary(auction, now),
    bids: visible.map(publicBid).reverse(), // newest first
  };
}

module.exports = { summary, detail };
