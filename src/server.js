// Entry point: wires everything together and starts the server.
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { port } = require('./config/env');
const Database = require('./patterns/singleton/Database');
const AuctionManager = require('./patterns/singleton/AuctionManager');
const Subject = require('./patterns/observer/Subject');
const BroadcastObserver = require('./patterns/observer/BroadcastObserver');
const OutbidObserver = require('./patterns/observer/OutbidObserver');
const AuditLogObserver = require('./patterns/observer/AuditLogObserver');
const AuctionController = require('./controllers/AuctionController');
const { createPipeline } = require('./middleware');

async function main() {
  // 1. Database must be reachable (and the tables must exist) before we accept anyone.
  const database = Database.getInstance();
  await database.query('SELECT 1 FROM auctions LIMIT 1');

  // 2. Singleton + Observer wiring.
  const manager = AuctionManager.getInstance();
  const events = new Subject();
  events.subscribe(new BroadcastObserver(manager));
  events.subscribe(new OutbidObserver(manager));
  events.subscribe(new AuditLogObserver());

  // 3. Controller + middleware pipeline.
  const controller = new AuctionController({ manager, events });
  const pipeline = createPipeline(controller);
  const restored = await controller.restoreTimers();

  // 4. HTTP server for the web page, WebSocket server on the same port.
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 10 * 1024 });

  wss.on('connection', (ws) => {
    manager.addClient(ws);
    ws.isAlive = true;
    ws.queue = Promise.resolve();

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (err) => console.error('[ws] socket error:', err.message));
    ws.on('close', () => manager.removeClient(ws));

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();
      // One message at a time per connection, so "LOGIN" is always finished before the next message.
      ws.queue = ws.queue.then(() => pipeline({ ws, raw })).catch((err) => console.error(err));
    });
  });

  // Drop connections that silently died (closed laptop, lost wifi...).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Change PORT in .env.` : err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Live Auction running on http://localhost:${port}`);
    if (restored) console.log(`Restored ${restored} open auction(s).`);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    wss.close();
    server.close();
    await database.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`Could not start the server: ${err.message}`);
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR') {
    console.error('The database is not set up yet. Run:  npm run db:init');
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Cannot reach MySQL. Is it running? Check the DB_* values in your .env file.');
  }
  process.exit(1);
});
