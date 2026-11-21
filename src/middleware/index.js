// The pipeline, in order. Read it top to bottom: that is the journey of every message.
const compose = require('./pipeline');
const errorHandler = require('./errorHandler');
const parse = require('./parse');
const logger = require('./logger');
const rateLimit = require('./rateLimit');
const validate = require('./validate');
const authenticate = require('./authenticate');
const createRouter = require('./router');

function createPipeline(controller) {
  return compose([
    errorHandler,   // 1. catches every error from the steps below
    parse,          // 2. text -> { type, payload }
    logger,         // 3. logs the message
    rateLimit(),    // 4. anti-flood
    validate,       // 5. checks and cleans the payload
    authenticate,   // 6. must be logged in
    createRouter(controller), // 7. calls the right controller method
  ]);
}

module.exports = { createPipeline };
