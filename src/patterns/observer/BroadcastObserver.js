// Observer #1: pushes live updates to the browsers through the WebSockets.
//   AUCTION_UPDATED -> everybody (keeps the lobby list live)
//   NEW_BID         -> only people inside that auction room (bid history)
//   AUCTION_ENDED   -> only people inside that auction room (result + revealed bids)
const Observer = require('./Observer');

class BroadcastObserver extends Observer {
  constructor(manager) {
    super();
    this.manager = manager;
  }

  update(event, data) {
    switch (event) {
      case 'AUCTION_CREATED':
        this.manager.broadcastAll('AUCTION_UPDATED', { auction: data.auction });
        break;

      case 'BID_PLACED':
        this.manager.broadcastAll('AUCTION_UPDATED', { auction: data.auction });
        if (data.bidsArePublic) {
          this.manager.broadcastRoom(data.auctionId, 'NEW_BID', {
            auctionId: data.auctionId,
            bid: data.bid,
          });
        }
        break;

      case 'AUCTION_ENDED':
        this.manager.broadcastAll('AUCTION_UPDATED', { auction: data.auction });
        this.manager.broadcastRoom(data.auctionId, 'AUCTION_ENDED', {
          auctionId: data.auctionId,
          auction: data.auction,
          bids: data.bids,
        });
        break;
    }
  }
}

module.exports = BroadcastObserver;
