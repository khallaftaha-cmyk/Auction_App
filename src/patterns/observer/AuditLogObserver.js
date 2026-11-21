// Observer #3: keeps a written history of everything that happens (console + logs/audit.log).
const fs = require('fs');
const path = require('path');
const Observer = require('./Observer');

const LOG_DIR = path.join(__dirname, '..', '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

class AuditLogObserver extends Observer {
  constructor() {
    super();
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  update(event, data) {
    const line = `${new Date().toISOString()} ${event} ${this.#describe(event, data)}`;
    console.log(`[audit] ${line}`);
    fs.appendFile(LOG_FILE, line + '\n', () => {}); // a logging failure must never break the app
  }

  #describe(event, data) {
    switch (event) {
      case 'AUCTION_CREATED':
        return `#${data.auction.id} "${data.auction.title}" (${data.auction.strategy}) by ${data.auction.creator}`;
      case 'BID_PLACED':
        return `#${data.auctionId} ${data.bid.username} bid ${data.bid.amount}`;
      case 'AUCTION_ENDED':
        return `#${data.auctionId} winner=${data.auction.winner ?? 'nobody'} amount=${data.auction.winningAmount ?? '-'}`;
      default:
        return '';
    }
  }
}

module.exports = AuditLogObserver;
