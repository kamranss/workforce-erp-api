const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { sendError } = require('../helpers/response');

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function requireAuth(handler) {
  return async function authWrappedHandler(req, res) {
    const token = getBearerToken(req);

    if (!token) {
      return sendError(
        res,
        401,
        'UNAUTHORIZED',
        'Missing or invalid Authorization header.'
      );
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.auth = {
        userId: decoded.userId || decoded.sub,
        role: decoded.role,
        email: decoded.email
      };

      return handler(req, res);
    } catch (error) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token.');
    }
  };
}

module.exports = {
  requireAuth
};
