// Step 4: at most `max` messages per `windowMs` for each connection.
// Stops a script (or a very excited bidder) from flooding the server.
const AppError = require('../utils/AppError');

module.exports = function rateLimit({ max = 20, windowMs = 5000 } = {}) {
  return async function rateLimitMiddleware(ctx, next) {
    const now = Date.now();
    const ws = ctx.ws;

    if (!ws.rate || now - ws.rate.start > windowMs) {
      ws.rate = { start: now, count: 0 };
    }
    ws.rate.count += 1;

    if (ws.rate.count > max) {
      throw new AppError('RATE_LIMITED', 'You are sending too many messages. Wait a few seconds.');
    }
    await next();
  };
};
