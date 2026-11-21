// Every message in both directions has the same shape: { type, payload }.
const OPEN = 1; // WebSocket.OPEN

function send(ws, type, payload = {}) {
  if (ws.readyState === OPEN) ws.send(JSON.stringify({ type, payload }));
}

module.exports = { send };
