const logger = require('../utils/logger');

const errorHandler = (err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    logger.error({ err }, '[error] unhandled server error');
  } else {
    logger.warn({ err }, '[error] client error');
  }

  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;
