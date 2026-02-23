const { isValidObjectId } = require('../helpers/timeEntries');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCreateBonusAndPenaltyPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidObjectId(payload.userId)) {
    details.push('userId is required and must be a valid ObjectId.');
  }

  if (!isFiniteNumber(payload.amount)) {
    details.push('amount is required and must be a valid number.');
  }

  if (payload.description !== undefined && typeof payload.description !== 'string') {
    details.push('description must be a string when provided.');
  }

  if (payload.effectiveAt !== undefined && Number.isNaN(new Date(payload.effectiveAt).getTime())) {
    details.push('effectiveAt must be a valid ISO date when provided.');
  }

  return details;
}

function validatePatchBonusAndPenaltyPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.amount !== undefined && !isFiniteNumber(payload.amount)) {
    details.push('amount must be a valid number when provided.');
  }

  if (payload.description !== undefined && payload.description !== null && typeof payload.description !== 'string') {
    details.push('description must be a string or null when provided.');
  }

  if (payload.effectiveAt !== undefined && Number.isNaN(new Date(payload.effectiveAt).getTime())) {
    details.push('effectiveAt must be a valid ISO date when provided.');
  }

  return details;
}

module.exports = {
  validateCreateBonusAndPenaltyPayload,
  validatePatchBonusAndPenaltyPayload
};
