// SINGLETON #2: the live state of the running server.
// There must be exactly one place that knows who is connected, who is in which
// auction room, which closing timers are running... otherwise two parts of the
// app could disagree about who should receive a message.
const { send } = require('../../websocket/messages');

class AuctionManager {
  static #instance = null;

  #clients = new Set(); // every open WebSocket
  #rooms = new Map(); //   auctionId -> Set of WebSockets watching that auction
  #timers = new Map(); //  auctionId -> timer that will close it
  #locks = new Map(); //   auctionId -> promise chain (see runExclusive)

  constructor() {
    if (AuctionManager.#instance) {
      throw new Error('AuctionManager is a singleton: use AuctionManager.getInstance()');
    }
    AuctionManager.#instance = this;
  }

  static getInstance() {
    return AuctionManager.#instance ?? new AuctionManager();
  }

  // ---- connected clients -------------------------------------------------
  addClient(ws) {
    this.#clients.add(ws);
  }

  removeClient(ws) {
    this.leave(ws);
    this.#clients.delete(ws);
  }

  // ---- rooms (one room per auction) -------------------------------------
  join(auctionId, ws) {
    this.leave(ws); // a socket watches one auction at a time
    if (!this.#rooms.has(auctionId)) this.#rooms.set(auctionId, new Set());
    this.#rooms.get(auctionId).add(ws);
    ws.roomId = auctionId;
  }

  leave(ws) {
    const room = this.#rooms.get(ws.roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) this.#rooms.delete(ws.roomId);
    }
    ws.roomId = null;
  }

  // ---- sending -------------------------------------------------------------
  broadcastAll(type, payload) {
    for (const ws of this.#clients) if (ws.user) send(ws, type, payload);
  }

  broadcastRoom(auctionId, type, payload) {
    for (const ws of this.#rooms.get(auctionId) ?? []) send(ws, type, payload);
  }

  sendToUser(userId, type, payload) {
    for (const ws of this.#clients) if (ws.user?.id === userId) send(ws, type, payload);
  }

  // ---- closing timers ------------------------------------------------------
  scheduleClose(auctionId, endsAt, callback) {
    this.clearTimer(auctionId);
    const delay = Math.max(0, endsAt - Date.now());
    this.#timers.set(auctionId, setTimeout(callback, delay));
  }

  clearTimer(auctionId) {
    clearTimeout(this.#timers.get(auctionId));
    this.#timers.delete(auctionId);
  }

  // ---- one-at-a-time per auction ------------------------------------------
  // Two people can click "Bid" in the same millisecond. Without protection both
  // bids could be checked against the same old price and both accepted.
  // runExclusive() queues the tasks of one auction so they run strictly one after another.
  runExclusive(auctionId, task) {
    const previous = this.#locks.get(auctionId) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.catch(() => {}); // a failed task must not block the queue
    this.#locks.set(auctionId, tail);
    tail.then(() => {
      if (this.#locks.get(auctionId) === tail) this.#locks.delete(auctionId);
    });
    return result;
  }
}

module.exports = AuctionManager;
