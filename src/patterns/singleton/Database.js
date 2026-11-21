// SINGLETON #1: one MySQL connection pool for the whole application.
// Every model calls Database.getInstance() and gets the very same pool,
// so we never open more connections than we mean to.
const mysql = require('mysql2/promise');
const { db } = require('../../config/env');

class Database {
  static #instance = null;
  #pool;

  constructor() {
    if (Database.#instance) {
      throw new Error('Database is a singleton: use Database.getInstance()');
    }
    this.#pool = mysql.createPool({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
    });
    Database.#instance = this;
  }

  static getInstance() {
    return Database.#instance ?? new Database();
  }

  // Returns the rows for a SELECT, or the result header (insertId...) for an INSERT/UPDATE.
  // Values are passed separately from the SQL ("?"), which prevents SQL injection.
  async query(sql, params = []) {
    const [rows] = await this.#pool.query(sql, params);
    return rows;
  }

  async close() {
    await this.#pool.end();
  }
}

module.exports = Database;
