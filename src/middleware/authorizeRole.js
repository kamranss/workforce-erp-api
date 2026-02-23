const { sendError } = require('../helpers/response');

function authorizeRole(...allowedRoles) {
  return function withRoleGuard(handler) {
    return async function roleGuardHandler(req, res) {
      const role = req.auth?.role;

      if (!role || !allowedRoles.includes(role)) {
        return sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions.');
      }

      return handler(req, res);
    };
  };
}

module.exports = {
  authorizeRole
};
