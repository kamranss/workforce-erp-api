const mongoose = require('mongoose');

function isTruthy(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isPasskeyEnabled() {
  return isTruthy(process.env.PASSKEY_ENABLED || process.env.FEATURE_PASSKEY_AUTH);
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPasskeyConfig() {
  const rpID = String(process.env.WEBAUTHN_RP_ID || '').trim();
  const rpName = String(process.env.WEBAUTHN_RP_NAME || '').trim() || 'ArchBuild';
  const originEnv = String(
    process.env.WEBAUTHN_ORIGIN || process.env.WEBAUTHN_ORIGINS || process.env.ALLOWED_ORIGINS || ''
  ).trim();
  const origins = parseCsv(originEnv);
  const ttlSecRaw = Number.parseInt(process.env.PASSKEY_CHALLENGE_TTL_SEC || '300', 10);
  const challengeTtlSec = Number.isNaN(ttlSecRaw) ? 300 : Math.min(Math.max(ttlSecRaw, 60), 900);

  return {
    rpID,
    rpName,
    origins,
    challengeTtlSec
  };
}

function validatePasskeyConfig(config) {
  const details = [];

  if (!config.rpID) {
    details.push('WEBAUTHN_RP_ID is required.');
  }

  if (!config.rpName) {
    details.push('WEBAUTHN_RP_NAME is required.');
  }

  if (!Array.isArray(config.origins) || config.origins.length === 0) {
    details.push(
      'WEBAUTHN_ORIGIN (or WEBAUTHN_ORIGINS/ALLOWED_ORIGINS) must include at least one allowed origin.'
    );
  }

  return details;
}

function getRequestIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).trim();
  }

  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return 'unknown';
}

function toBase64(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const full = remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`;
  return full;
}

function getCredentialChallenge(credential) {
  const encodedClientData = credential?.response?.clientDataJSON;
  if (typeof encodedClientData !== 'string' || !encodedClientData) {
    return null;
  }

  try {
    const clientDataJson = Buffer.from(toBase64(encodedClientData), 'base64').toString('utf8');
    const parsed = JSON.parse(clientDataJson);
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch (error) {
    return null;
  }
}

function getCredentialId(credential) {
  if (credential && typeof credential.id === 'string' && credential.id) {
    return credential.id;
  }

  if (credential && typeof credential.rawId === 'string' && credential.rawId) {
    return credential.rawId;
  }

  return null;
}

function ensureObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function toPasskeyListItem(doc) {
  return {
    id: String(doc._id),
    credentialId: doc.credentialId,
    transports: Array.isArray(doc.transports) ? doc.transports : [],
    deviceType: doc.deviceType || null,
    backedUp: typeof doc.backedUp === 'boolean' ? doc.backedUp : null,
    createdAt: doc.createdAt || null,
    lastUsedAt: doc.lastUsedAt || null
  };
}

function auditPasskeyEvent(event, meta = {}) {
  const enabled = String(process.env.PASSKEY_AUDIT_LOGS || '').trim().toLowerCase();
  if (!(enabled === '1' || enabled === 'true' || enabled === 'yes' || enabled === 'on')) {
    return;
  }

  try {
    console.info(`[passkey-audit] ${event}`, meta);
  } catch (error) {
    void error;
  }
}

module.exports = {
  isPasskeyEnabled,
  getPasskeyConfig,
  validatePasskeyConfig,
  getRequestIp,
  getCredentialChallenge,
  getCredentialId,
  ensureObjectId,
  toPasskeyListItem,
  auditPasskeyEvent
};
