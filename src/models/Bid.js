// MODEL: bids. Only talks to the database, knows nothing about WebSockets.
const Database = require('../patterns/singleton/Database');

const db = () => Database.getInstance();

class Bid {
  static async create({ auctionId, userId, amount }) {
    const placedAt = Date.now();
    const result = await db().query(
      'INSERT INTO bids (auction_id, user_id, amount, placed_at) VALUES (?, ?, ?, ?)',
      [auctionId, userId, amount, placedAt]
    );
    return { id: result.insertId, auctionId, userId, amount, placedAt };
  }

  // Oldest first: on a tie, the earliest bid comes first (and therefore wins).
  static async forAuction(auctionId) {
    const rows = await db().query(
      `SELECT b.id, b.auction_id, b.user_id, b.amount, b.placed_at, u.username
       FROM bids b
       JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = ?
       ORDER BY b.placed_at ASC, b.id ASC`,
      [auctionId]
    );
    return rows.map((row) => ({
      id: row.id,
      auctionId: row.auction_id,
      userId: row.user_id,
      username: row.username,
      amount: row.amount,
      placedAt: Number(row.placed_at),
    }));
  }
}

module.exports = Bid;
