const { sendMethodNotAllowed, sendError } = require('../../src/helpers/response');

module.exports = async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  }

  return sendError(
    res,
    410,
    'ROUTE_DEPRECATED',
    'This route is deprecated. Use /api/users/id?id=<userId> instead.'
  );
};