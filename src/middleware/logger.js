// Step 3: logs every message and how long it took.
// Shows the "onion" shape of middleware: code before `next()` runs on the way in,
// code after it (here, in `finally`) runs on the way out.
module.exports = async function logger(ctx, next) {
  const start = Date.now();
  try {
    await next();
  } finally {
    const who = ctx.ws.user ? ctx.ws.user.username : 'anonymous';
    console.log(`[ws] ${who} ${ctx.message.type} (${Date.now() - start} ms)`);
  }
};
