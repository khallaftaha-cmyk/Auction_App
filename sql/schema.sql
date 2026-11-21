-- Live Auction: database schema
-- Run with `npm run db:init` (it creates the database too, and upgrades an older database),
-- or import this file by hand into a new database (phpMyAdmin, MySQL Workbench...).

CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(30) NOT NULL UNIQUE,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auctions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(100)  NOT NULL,
  description     VARCHAR(500)  NOT NULL DEFAULT '',
  strategy        ENUM('english', 'sealed', 'dutch') NOT NULL DEFAULT 'english',
  start_price     INT UNSIGNED  NOT NULL,
  min_increment   INT UNSIGNED  NOT NULL DEFAULT 1,
  starts_at       BIGINT        NULL,                  -- epoch milliseconds
  ends_at         BIGINT        NOT NULL,              -- epoch milliseconds
  floor_price     INT UNSIGNED  NULL,                  -- Dutch auctions only: the lowest price
  status          ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  created_by      INT           NOT NULL,
  winner_id       INT           NULL,
  winning_amount  INT UNSIGNED  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (winner_id)  REFERENCES users(id)
);

-- The current price is never stored: it is always derived from the bids
-- (or, for a Dutch auction, from the clock), so it can never get out of sync.
CREATE TABLE IF NOT EXISTS bids (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  auction_id  INT          NOT NULL,
  user_id     INT          NOT NULL,
  amount      INT UNSIGNED NOT NULL,
  placed_at   BIGINT       NOT NULL,                   -- epoch milliseconds
  INDEX idx_bids_auction (auction_id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (user_id)    REFERENCES users(id)
);
