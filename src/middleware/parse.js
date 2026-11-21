// Step 2: raw text -> { type, payload }. Rejects anything that is not a well-formed message.
const AppError = require('../utils/AppError');

module.exports = async function parse(ctx, next) {
  let message;
  try {
    message = JSON.parse(ctx.raw);
  } catch {
    throw new AppError('INVALID_JSON', 'Messages must be valid JSON.');
  }

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  if (!isObject(message) || typeof message.type !== 'string') {
    throw new AppError('INVALID_MESSAGE', 'A message needs a text "type".');
  }
  const payload = message.payload ?? {};
  if (!isObject(payload)) {
    throw new AppError('INVALID_MESSAGE', 'The "payload" must be an object.');
  }

  ctx.message = { type: message.type, payload };
  await next();
};
