function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalStringOrNull(value) {
  return value === null || typeof value === 'string';
}

function isValidEmail(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateCreateCustomerPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isNonEmptyString(payload.fullName)) {
    details.push('fullName is required and must be a non-empty string.');
  }

  if (payload.address !== undefined && !isOptionalStringOrNull(payload.address)) {
    details.push('address must be a string or null when provided.');
  }

  if (payload.email !== undefined) {
    if (payload.email !== null && typeof payload.email !== 'string') {
      details.push('email must be a string or null when provided.');
    } else if (typeof payload.email === 'string' && payload.email.trim() && !isValidEmail(payload.email)) {
      details.push('email must be a valid email when provided.');
    }
  }

  if (payload.phone !== undefined && !isOptionalStringOrNull(payload.phone)) {
    details.push('phone must be a string or null when provided.');
  }

  return details;
}

function validatePatchCustomerPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.fullName !== undefined) {
    if (payload.fullName === null || typeof payload.fullName !== 'string') {
      details.push('fullName must be a non-empty string when provided.');
    } else if (!payload.fullName.trim()) {
      details.push('fullName cannot be empty when provided.');
    }
  }

  if (payload.address !== undefined && !isOptionalStringOrNull(payload.address)) {
    details.push('address must be a string or null when provided.');
  }

  if (payload.email !== undefined) {
    if (payload.email !== null && typeof payload.email !== 'string') {
      details.push('email must be a string or null when provided.');
    } else if (typeof payload.email === 'string' && payload.email.trim() && !isValidEmail(payload.email)) {
      details.push('email must be a valid email when provided.');
    }
  }

  if (payload.phone !== undefined && !isOptionalStringOrNull(payload.phone)) {
    details.push('phone must be a string or null when provided.');
  }

  return details;
}

module.exports = {
  validateCreateCustomerPayload,
  validatePatchCustomerPayload
};
