// The WebSocket MIDDLEWARE engine.
//
// A middleware is a function (ctx, next). It can look at / change `ctx`, then either
//   - call `await next()` to pass the message to the following step, or
//   - throw an error to stop the message right there.
//
// compose([a, b, c]) returns ONE function that runs a, then b, then c.
// Code written after `await next()` runs on the way back (see logger.js).
function compose(middlewares) {
  return function run(ctx) {
    let lastIndex = -1;

    function dispatch(index) {
      if (index <= lastIndex) return Promise.reject(new Error('next() was called twice'));
      lastIndex = index;

      const middleware = middlewares[index];
      if (!middleware) return Promise.resolve(); // end of the chain

      try {
        return Promise.resolve(middleware(ctx, () => dispatch(index + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

module.exports = compose;
