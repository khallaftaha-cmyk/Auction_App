// A tiny WebSocket client: sends { type, payload }, dispatches incoming messages by type,
// and reconnects by itself (1 s, 2 s, 4 s ... up to 10 s) if the connection drops.
export class AuctionSocket {
  #url;
  #ws = null;
  #handlers = new Map();
  #attempt = 0;

  constructor(url) {
    this.#url = url;
  }

  // socket.on('NEW_BID', (payload) => ...)   also: 'open' and 'close'
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, []);
    this.#handlers.get(type).push(handler);
    return this;
  }

  connect() {
    this.#ws = new WebSocket(this.#url);

    this.#ws.addEventListener('open', () => {
      this.#attempt = 0;
      this.#emit('open');
    });

    this.#ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return; // ignore anything that is not JSON
      }
      this.#emit(message.type, message.payload);
    });

    this.#ws.addEventListener('close', () => {
      this.#emit('close');
      const delay = Math.min(1000 * 2 ** this.#attempt, 10000);
      this.#attempt += 1;
      setTimeout(() => this.connect(), delay);
    });
  }

  // Returns false when the connection is not open (so the caller can tell the user).
  send(type, payload = {}) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return false;
    this.#ws.send(JSON.stringify({ type, payload }));
    return true;
  }

  #emit(type, payload) {
    for (const handler of this.#handlers.get(type) ?? []) handler(payload);
  }
}
