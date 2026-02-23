const { isValidObjectId } = require('../helpers/timeEntries');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCreatePaymentPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidObjectId(payload.userId)) {
    details.push('userId is required and must be a valid ObjectId.');
  }

  if (!isFiniteNumber(payload.amount) || payload.amount <= 0) {
    details.push('amount is required and must be greater than 0.');
  }

  if (payload.paidAt !== undefined && Number.isNaN(new Date(payload.paidAt).getTime())) {
    details.push('paidAt must be a valid ISO date when provided.');
  }

  if (payload.method !== undefined && typeof payload.method !== 'string') {
    details.push('method must be a string when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validatePatchPaymentPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.amount !== undefined && (!isFiniteNumber(payload.amount) || payload.amount <= 0)) {
    details.push('amount must be greater than 0 when provided.');
  }

  if (payload.paidAt !== undefined && Number.isNaN(new Date(payload.paidAt).getTime())) {
    details.push('paidAt must be a valid ISO date when provided.');
  }

  if (payload.method !== undefined && payload.method !== null && typeof payload.method !== 'string') {
    details.push('method must be a string or null when provided.');
  }

  if (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== 'string') {
    details.push('notes must be a string or null when provided.');
  }

  return details;
}

module.exports = {
  validateCreatePaymentPayload,
  validatePatchPaymentPayload
};
