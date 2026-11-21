// MODEL: auctions. Only talks to the database, knows nothing about WebSockets.
const Database = require('../patterns/singleton/Database');

const db = () => Database.getInstance();

// One query shape used everywhere: the auction + creator + winner + highest bid
// + who made it + number of bids.
const SELECT = `
  SELECT a.*,
         u.username AS creator,
         w.username AS winner,
         (SELECT MAX(amount) FROM bids WHERE auction_id = a.id) AS top_amount,
         (SELECT COUNT(*)    FROM bids WHERE auction_id = a.id) AS bid_count,
         (SELECT bu.username
            FROM bids b
            JOIN users bu ON bu.id = b.user_id
           WHERE b.auction_id = a.id
           ORDER BY b.amount DESC, b.placed_at ASC, b.id ASC
           LIMIT 1) AS leader
  FROM auctions a
  JOIN users u       ON u.id = a.created_by
  LEFT JOIN users w  ON w.id = a.winner_id`;

// Database columns (snake_case) -> JavaScript object (camelCase)
function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    strategy: row.strategy,
    startPrice: row.start_price,
    minIncrement: row.min_increment,
    startsAt: row.starts_at == null ? null : Number(row.starts_at),
    endsAt: Number(row.ends_at),
    floorPrice: row.floor_price,
    status: row.status,
    createdBy: row.created_by,
    creator: row.creator,
    winnerId: row.winner_id,
    winner: row.winner,
    winningAmount: row.winning_amount,
    topAmount: row.top_amount,
    bidCount: Number(row.bid_count),
    leader: row.leader,
  };
}

class Auction {
  static async create({ title, description, strategy, startPrice, minIncrement, startsAt, endsAt, floorPrice, createdBy }) {
    const result = await db().query(
      `INSERT INTO auctions
         (title, description, strategy, start_price, min_increment, starts_at, ends_at, floor_price, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, strategy, startPrice, minIncrement, startsAt, endsAt, floorPrice, createdBy]
    );
    return Auction.findById(result.insertId);
  }

  static async findById(id) {
    const rows = await db().query(`${SELECT} WHERE a.id = ?`, [id]);
    return rows.length ? fromRow(rows[0]) : null;
  }

  // Open auctions first (soonest ending on top), then the most recently closed ones.
  static async listRecent(limit = 50) {
    const rows = await db().query(
      `${SELECT}
       ORDER BY a.status = 'open' DESC,
                IF(a.status = 'open', a.ends_at, -a.ends_at) ASC
       LIMIT ?`,
      [limit]
    );
    return rows.map(fromRow);
  }

  // Used at startup to put the closing timers back after a server restart.
  static async listOpen() {
    const rows = await db().query(`${SELECT} WHERE a.status = 'open'`);
    return rows.map(fromRow);
  }

  static async close(id, winnerId, winningAmount) {
    await db().query(
      `UPDATE auctions SET status = 'closed', winner_id = ?, winning_amount = ?
       WHERE id = ? AND status = 'open'`,
      [winnerId, winningAmount, id]
    );
  }
}

module.exports = Auction;
