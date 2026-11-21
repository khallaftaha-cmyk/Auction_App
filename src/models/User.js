// MODEL: users. Only talks to the database, knows nothing about WebSockets.
const Database = require('../patterns/singleton/Database');

const db = () => Database.getInstance();

class User {
  // "Login" is deliberately simple for this project: type a name, get an account.
  // (No password: the module is about architecture, not authentication.)
  static async findOrCreate(username) {
    await db().query('INSERT IGNORE INTO users (username) VALUES (?)', [username]);
    const rows = await db().query('SELECT id, username FROM users WHERE username = ?', [username]);
    return { id: rows[0].id, username: rows[0].username };
  }
}

module.exports = User;
