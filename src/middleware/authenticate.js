// Step 6: everything except LOGIN requires a logged-in connection.
const AppError = require('../utils/AppError');

module.exports = async function authenticate(ctx, next) {
  const isLogin = ctx.message.type === 'LOGIN';

  if (!isLogin && !ctx.ws.user) {
    throw new AppError('AUTH_REQUIRED', 'Please log in first.');
  }
  if (isLogin && ctx.ws.user) {
    throw new AppError('ALREADY_LOGGED_IN', 'You are already logged in.');
  }
  await next();
};
