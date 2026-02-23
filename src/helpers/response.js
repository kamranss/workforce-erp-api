function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function sendSuccess(res, data = {}, statusCode = 200) {
  sendJson(res, statusCode, {
    ok: true,
    data
  });
}

function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

function sendMethodNotAllowed(res, allowedMethods = []) {
  res.setHeader('Allow', allowedMethods);
  sendError(
    res,
    405,
    'METHOD_NOT_ALLOWED',
    `Method not allowed. Use one of: ${allowedMethods.join(', ')}`,
    { allowedMethods }
  );
}

function sendNotImplemented(res, message) {
  sendError(res, 501, 'NOT_IMPLEMENTED', message || 'Not implemented yet.');
}

module.exports = {
  sendJson,
  sendSuccess,
  sendError,
  sendMethodNotAllowed,
  sendNotImplemented
};
