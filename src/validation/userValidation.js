const { USER_ROLES, PAYMENT_OPTIONS } = require('../models/User');
const { isValidRawPassCode } = require('../helpers/passcode');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmail(value) {
  if (!isNonEmptyString(value)) {
    return '';
  }

  return value.trim().toLowerCase();
}

function validateCreateUserPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isNonEmptyString(payload.name)) {
    details.push('name is required and must be a non-empty string.');
  }

  if (!isNonEmptyString(payload.surname)) {
    details.push('surname is required and must be a non-empty string.');
  }

  if (!isNonEmptyString(payload.email)) {
    details.push('email is required and must be a non-empty string.');
  }

  if (!isValidRawPassCode(payload.passCode)) {
    details.push('passCode must be exactly 6 numeric digits.');
  }

  if (!USER_ROLES.includes(payload.role)) {
    details.push('role must be one of: superAdmin, admin, user.');
  }

  if (!PAYMENT_OPTIONS.includes(payload.paymentOption)) {
    details.push('paymentOption must be one of: hourly, monthly.');
  }

  if (
    typeof payload.paymentAmount !== 'number' ||
    Number.isNaN(payload.paymentAmount) ||
    payload.paymentAmount < 0
  ) {
    details.push('paymentAmount must be a valid number greater than or equal to 0.');
  }

  if (
    payload.isActive !== undefined &&
    typeof payload.isActive !== 'boolean'
  ) {
    details.push('isActive must be a boolean when provided.');
  }

  return details;
}

function validatePatchUserPayload(payload, isAdmin) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.name !== undefined && !isNonEmptyString(payload.name)) {
    details.push('name must be a non-empty string.');
  }

  if (payload.surname !== undefined && !isNonEmptyString(payload.surname)) {
    details.push('surname must be a non-empty string.');
  }

  if (payload.email !== undefined && !isNonEmptyString(payload.email)) {
    details.push('email must be a non-empty string.');
  }

  if (payload.passCode !== undefined && !isValidRawPassCode(payload.passCode)) {
    details.push('passCode must be exactly 6 numeric digits.');
  }

  if (payload.paymentOption !== undefined && !PAYMENT_OPTIONS.includes(payload.paymentOption)) {
    details.push('paymentOption must be one of: hourly, monthly.');
  }

  if (
    payload.paymentAmount !== undefined &&
    (
      typeof payload.paymentAmount !== 'number' ||
      Number.isNaN(payload.paymentAmount) ||
      payload.paymentAmount < 0
    )
  ) {
    details.push('paymentAmount must be a valid number greater than or equal to 0.');
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') {
    details.push('isActive must be a boolean.');
  }

  if (payload.role !== undefined) {
    if (!isAdmin) {
      details.push('role cannot be updated by non-admin users.');
    } else if (!USER_ROLES.includes(payload.role)) {
      details.push('role must be one of: superAdmin, admin, user.');
    }
  }

  return details;
}

function validateLoginPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidRawPassCode(payload.passCode)) {
    details.push('passCode must be exactly 6 numeric digits.');
  }

  return details;
}

module.exports = {
  normalizeEmail,
  validateCreateUserPayload,
  validatePatchUserPayload,
  validateLoginPayload
};
