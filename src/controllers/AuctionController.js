// CONTROLLER: the business rules ("what happens when someone bids").
// It never touches a socket or a SQL query directly:
//   - it asks the FACTORY to create auctions (factory method pattern),
//   - it asks the MODELS to read/write data,
//   - it asks the STRATEGY whether a bid is valid and who won,
//   - it announces what happened through the SUBJECT (observer pattern),
//   - it returns plain { type, payload } replies that the router sends back.
const User = require('../models/User');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const AppError = require('../utils/AppError');
const { highestBid, publicBid } = require('../utils/bids');
const { getCreator, getStrategy } = require('../patterns/factory');
const view = require('../views/auctionView');

class AuctionController {
  constructor({ manager, events }) {
    this.manager = manager; // Singleton: who is connected, rooms, timers
    this.events = events;   // Subject: observers listen here
  }

  // ---- accounts --------------------------------------------------------------
  async login(ws, { username }) {
    ws.user = await User.findOrCreate(username);
    return { type: 'LOGGED_IN', payload: { user: ws.user, serverTime: Date.now() } };
  }

  // ---- reading -----------------------------------------------------------------
  async listAuctions() {
    const now = Date.now();
    const auctions = await Auction.listRecent();
    return {
      type: 'AUCTION_LIST',
      payload: { auctions: auctions.map((auction) => view.summary(auction, now)), serverTime: now },
    };
  }

  async joinAuction(ws, { auctionId }) {
    const now = Date.now();
    const auction = await this.#mustFind(auctionId);
    const bids = await Bid.forAuction(auctionId);
    this.manager.join(auctionId, ws);
    return {
      type: 'AUCTION_STATE',
      payload: { ...view.detail(auction, bids, ws.user.id, now), serverTime: now },
    };
  }

  leaveAuction(ws) {
    this.manager.leave(ws);
  }

  // ---- creating ----------------------------------------------------------------
  async createAuction(ws, data) {
    // FACTORY METHOD: the creator of this auction type builds the database record.
    const { record } = getCreator(data.strategy).build(data, ws.user.id);
    const auction = await Auction.create(record);

    this.#scheduleClose(auction);
    this.events.notify('AUCTION_CREATED', { auction: view.summary(auction) });
    return { type: 'AUCTION_CREATED_OK', payload: { auctionId: auction.id } };
  }

  // ---- bidding -----------------------------------------------------------------
  placeBid(ws, { auctionId, amount }) {
    // runExclusive: bids on the same auction are handled one at a time (see AuctionManager).
    return this.manager.runExclusive(auctionId, async () => {
      const now = Date.now();
      const auction = await this.#mustFind(auctionId);

      if (auction.status !== 'open' || auction.endsAt <= now) {
        throw new AppError('AUCTION_CLOSED', 'This auction has ended.');
      }
      if (auction.createdBy === ws.user.id) {
        throw new AppError('OWN_AUCTION', 'You cannot bid on your own auction.');
      }

      const strategy = getStrategy(auction.strategy);
      const bids = await Bid.forAuction(auctionId);
      strategy.validateBid({ auction, bids, user: ws.user, amount, now }); // throws if not allowed

      const previousTop = highestBid(bids);
      const saved = await Bid.create({
        auctionId,
        userId: ws.user.id,
        amount: strategy.resolveAmount({ auction, amount, now }),
      });
      const bid = publicBid({ ...saved, username: ws.user.username });
      const updated = await this.#mustFind(auctionId);

      this.events.notify('BID_PLACED', {
        auctionId,
        auction: view.summary(updated, now),
        bid,
        bidderId: ws.user.id,
        previousTop,
        bidsArePublic: strategy.bidsArePublic,
      });

      // Some auctions end on the spot (Dutch: the first buyer wins).
      if (strategy.endsOnFirstBid) await this.#finish(updated);

      return { type: 'BID_ACCEPTED', payload: { auctionId, bid } };
    });
  }

  // ---- closing (called by the timer, not by a user) -----------------------------
  closeAuction(auctionId) {
    return this.manager.runExclusive(auctionId, async () => {
      const auction = await Auction.findById(auctionId);
      if (!auction || auction.status === 'closed') return;

      // Safety net: a timer that fires a hair early just goes back to sleep.
      if (auction.endsAt > Date.now()) {
        this.#scheduleClose(auction);
        return;
      }
      await this.#finish(auction);
    });
  }

  // After a server restart, open auctions need their closing timers back.
  async restoreTimers() {
    const open = await Auction.listOpen();
    open.forEach((auction) => this.#scheduleClose(auction));
    return open.length;
  }

  // ---- helpers -------------------------------------------------------------------
  // Picks the winner, saves the result, tells everybody. Always called INSIDE runExclusive.
  async #finish(auction) {
    const bids = await Bid.forAuction(auction.id);
    const winningBid = getStrategy(auction.strategy).determineWinner(auction, bids);
    await Auction.close(auction.id, winningBid ? winningBid.userId : null, winningBid ? winningBid.amount : null);
    this.manager.clearTimer(auction.id);

    const closed = await Auction.findById(auction.id);
    this.events.notify('AUCTION_ENDED', {
      auctionId: auction.id,
      auction: view.summary(closed),
      bids: bids.map(publicBid).reverse(), // everything is revealed now
    });
  }

  #scheduleClose(auction) {
    this.manager.scheduleClose(auction.id, auction.endsAt, () => {
      this.closeAuction(auction.id).catch((err) =>
        console.error(`Could not close auction #${auction.id}:`, err)
      );
    });
  }

  async #mustFind(auctionId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) throw new AppError('NOT_FOUND', 'This auction does not exist.');
    return auction;
  }
}

module.exports = AuctionController;
