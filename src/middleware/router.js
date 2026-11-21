// Step 7 (last): maps message.type to a controller method and sends the reply.
// This is the only place where the WebSocket layer meets the controller,
// and it contains no business logic at all.
const { send } = require('../websocket/messages');

function createRouter(controller) {
  const routes = {
    LOGIN: (ws, payload) => controller.login(ws, payload),
    LIST_AUCTIONS: () => controller.listAuctions(),
    JOIN_AUCTION: (ws, payload) => controller.joinAuction(ws, payload),
    LEAVE_AUCTION: (ws) => controller.leaveAuction(ws),
    CREATE_AUCTION: (ws, payload) => controller.createAuction(ws, payload),
    PLACE_BID: (ws, payload) => controller.placeBid(ws, payload),
  };

  return async function router(ctx) {
    const reply = await routes[ctx.message.type](ctx.ws, ctx.message.payload);
    if (reply) send(ctx.ws, reply.type, reply.payload);
  };
}

module.exports = createRouter;
