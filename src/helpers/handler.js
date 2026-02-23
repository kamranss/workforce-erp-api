const { sendError } = require('./response');

const LOCAL_FALLBACK_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003'
];

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Origin header never includes a path; normalize accidental trailing slash.
  return value.trim().replace(/\/+$/, '');
}

function getAllowedOrigins() {
  const fromEnv = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  const origins = fromEnv.length > 0 ? fromEnv : LOCAL_FALLBACK_ORIGINS;
  return new Set(origins);
}

function applyCorsHeaders(req, res) {
  const allowedOrigins = getAllowedOrigins();
  const origin = normalizeOrigin(req.headers.origin);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function withErrorHandling(handler) {
  return async function wrappedHandler(req, res) {
    applyCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    try {
      return await handler(req, res);
    } catch (error) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }
  };
}

module.exports = {
  withErrorHandling
};
