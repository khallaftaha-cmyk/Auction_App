// Step 1: wraps everything after it. Any error thrown further down ends up here
// and is turned into an ERROR message for the sender.
const AppError = require('../utils/AppError');
const { send } = require('../websocket/messages');

module.exports = async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      send(ctx.ws, 'ERROR', { code: err.code, message: err.message });
    } else {
      console.error('[server error]', err); // a bug: log it, but do not leak details to the user
      send(ctx.ws, 'ERROR', { code: 'SERVER_ERROR', message: 'Something went wrong on the server.' });
    }
  }
};
