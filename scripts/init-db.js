// Creates the database (if needed) and the tables, and upgrades an older database.
// Safe to run as many times as you like; it never deletes data. Usage: npm run db:init
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

// Version 1 of the app had no Dutch auctions. This brings such a database up to date.
async function upgradeOlderDatabase(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auctions'`,
    [db.database]
  );
  const existing = new Set(columns.map((column) => column.name));

  if (!existing.has('starts_at')) {
    await connection.query('ALTER TABLE auctions ADD COLUMN starts_at BIGINT NULL AFTER min_increment');
  }
  if (!existing.has('floor_price')) {
    await connection.query('ALTER TABLE auctions ADD COLUMN floor_price INT UNSIGNED NULL AFTER ends_at');
  }
  await connection.query(
    "ALTER TABLE auctions MODIFY strategy ENUM('english', 'sealed', 'dutch') NOT NULL DEFAULT 'english'"
  );
}

async function main() {
  if (!/^\w+$/.test(db.database)) {
    throw new Error('DB_NAME may only contain letters, numbers and underscores.');
  }

  const connection = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${db.database}\``);

  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await connection.query(schema);
  await upgradeOlderDatabase(connection);
  await connection.end();

  console.log(`Database "${db.database}" is ready.`);
}

main().catch((err) => {
  console.error(`Could not initialise the database: ${err.message}`);
  console.error('Is MySQL running? Are the DB_* values in your .env correct?');
  process.exit(1);
});
