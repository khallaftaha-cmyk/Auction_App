// Observer #2: tells the previous leader, privately, that somebody beat their bid.
// (Only for open-bid auctions: in a sealed auction nobody knows who is leading.)
const Observer = require('./Observer');

class OutbidObserver extends Observer {
  constructor(manager) {
    super();
    this.manager = manager;
  }

  update(event, data) {
    if (event !== 'BID_PLACED' || !data.bidsArePublic) return;

    const previous = data.previousTop;
    if (!previous || previous.userId === data.bidderId) return;

    this.manager.sendToUser(previous.userId, 'OUTBID', {
      auctionId: data.auctionId,
      title: data.auction.title,
      amount: data.bid.amount,
      by: data.bid.username,
    });
  }
}

module.exports = OutbidObserver;
