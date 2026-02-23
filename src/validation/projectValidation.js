const { PROJECT_STATUSES } = require('../models/Project');
const { isValidObjectId } = require('../helpers/timeEntries');

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

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidDateValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function validateGeo(geo, required) {
  const details = [];

  if (required && (!geo || typeof geo !== 'object')) {
    return ['geo is required and must be an object.'];
  }

  if (!required && geo === undefined) {
    return details;
  }

  if (!geo || typeof geo !== 'object') {
    return ['geo must be an object when provided.'];
  }

  if ((required || geo.lat !== undefined) && !isFiniteNumber(geo.lat)) {
    details.push('geo.lat is required and must be a valid number.');
  }

  if ((required || geo.lng !== undefined) && !isFiniteNumber(geo.lng)) {
    details.push('geo.lng is required and must be a valid number.');
  }

  return details;
}

function validateAddress(address, required) {
  const details = [];

  if (required && (!address || typeof address !== 'object')) {
    return ['address is required and must be an object.'];
  }

  if (!required && address === undefined) {
    return details;
  }

  if (!address || typeof address !== 'object') {
    return ['address must be an object when provided.'];
  }

  if ((required || address.raw !== undefined) && !isNonEmptyString(address.raw)) {
    details.push('address.raw is required and must be a non-empty string.');
  }

  if (address.normalized !== undefined && !isNonEmptyString(address.normalized)) {
    details.push('address.normalized must be a non-empty string when provided.');
  }

  if (address.lat !== undefined && !isFiniteNumber(address.lat)) {
    details.push('address.lat must be a valid number when provided.');
  }

  if (address.lng !== undefined && !isFiniteNumber(address.lng)) {
    details.push('address.lng must be a valid number when provided.');
  }

  return details;
}

function validateCreateProjectPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isNonEmptyString(payload.description)) {
    details.push('description is required and must be a non-empty string.');
  }

  if (payload.status !== undefined && !PROJECT_STATUSES.includes(payload.status)) {
    details.push('status must be one of: waiting, ongoing, finished, canceled.');
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') {
    details.push('isActive must be a boolean when provided.');
  }

  if (payload.quoteNumber !== undefined && typeof payload.quoteNumber !== 'string') {
    details.push('quoteNumber must be a string when provided.');
  }

  if (
    payload.quoteAmount !== undefined &&
    (!isFiniteNumber(payload.quoteAmount) || payload.quoteAmount < 0)
  ) {
    details.push('quoteAmount must be a valid number greater than or equal to 0.');
  }
  if (payload.customerId !== undefined && payload.customerId !== null && !isValidObjectId(payload.customerId)) {
    details.push('customerId must be a valid ObjectId when provided.');
  }
  if (payload.materials !== undefined && !isOptionalStringOrNull(payload.materials)) {
    details.push('materials must be a string or null when provided.');
  }
  if (payload.clientFullName !== undefined && !isOptionalStringOrNull(payload.clientFullName)) {
    details.push('clientFullName must be a string or null when provided.');
  }
  if (payload.clientPhone !== undefined && !isOptionalStringOrNull(payload.clientPhone)) {
    details.push('clientPhone must be a string or null when provided.');
  }
  if (payload.clientEmail !== undefined) {
    if (payload.clientEmail !== null && typeof payload.clientEmail !== 'string') {
      details.push('clientEmail must be a string or null when provided.');
    } else if (typeof payload.clientEmail === 'string' && payload.clientEmail.trim() && !isValidEmail(payload.clientEmail)) {
      details.push('clientEmail must be a valid email when provided.');
    }
  }

  if (payload.locationKey !== undefined && !isNonEmptyString(payload.locationKey)) {
    details.push('locationKey must be a non-empty string when provided.');
  }

  if (
    payload.estimatedStartAt !== undefined &&
    payload.estimatedStartAt !== null &&
    !isValidDateValue(payload.estimatedStartAt)
  ) {
    details.push('estimatedStartAt must be a valid date when provided.');
  }

  if (
    payload.geoRadiusMeters !== undefined &&
    (!isFiniteNumber(payload.geoRadiusMeters) || payload.geoRadiusMeters < 0)
  ) {
    details.push('geoRadiusMeters must be a valid number greater than or equal to 0.');
  }

  if (payload.status === 'ongoing') {
    details.push(...validateGeo(payload.geo, true));
  } else {
    details.push(...validateGeo(payload.geo, false));
  }

  details.push(...validateAddress(payload.address, true));
  return details;
}

function validatePatchProjectPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.description !== undefined && !isNonEmptyString(payload.description)) {
    details.push('description must be a non-empty string.');
  }

  if (payload.status !== undefined && !PROJECT_STATUSES.includes(payload.status)) {
    details.push('status must be one of: waiting, ongoing, finished, canceled.');
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') {
    details.push('isActive must be a boolean.');
  }

  if (payload.quoteNumber !== undefined && typeof payload.quoteNumber !== 'string') {
    details.push('quoteNumber must be a string when provided.');
  }

  if (
    payload.quoteAmount !== undefined &&
    (!isFiniteNumber(payload.quoteAmount) || payload.quoteAmount < 0)
  ) {
    details.push('quoteAmount must be a valid number greater than or equal to 0.');
  }
  if (payload.customerId !== undefined && payload.customerId !== null && !isValidObjectId(payload.customerId)) {
    details.push('customerId must be a valid ObjectId or null when provided.');
  }
  if (payload.materials !== undefined && !isOptionalStringOrNull(payload.materials)) {
    details.push('materials must be a string or null when provided.');
  }
  if (payload.clientFullName !== undefined && !isOptionalStringOrNull(payload.clientFullName)) {
    details.push('clientFullName must be a string or null when provided.');
  }
  if (payload.clientPhone !== undefined && !isOptionalStringOrNull(payload.clientPhone)) {
    details.push('clientPhone must be a string or null when provided.');
  }
  if (payload.clientEmail !== undefined) {
    if (payload.clientEmail !== null && typeof payload.clientEmail !== 'string') {
      details.push('clientEmail must be a string or null when provided.');
    } else if (typeof payload.clientEmail === 'string' && payload.clientEmail.trim() && !isValidEmail(payload.clientEmail)) {
      details.push('clientEmail must be a valid email when provided.');
    }
  }

  if (payload.locationKey !== undefined && !isNonEmptyString(payload.locationKey)) {
    details.push('locationKey must be a non-empty string.');
  }

  if (
    payload.estimatedStartAt !== undefined &&
    payload.estimatedStartAt !== null &&
    !isValidDateValue(payload.estimatedStartAt)
  ) {
    details.push('estimatedStartAt must be a valid date when provided.');
  }

  if (
    payload.geoRadiusMeters !== undefined &&
    (!isFiniteNumber(payload.geoRadiusMeters) || payload.geoRadiusMeters < 0)
  ) {
    details.push('geoRadiusMeters must be a valid number greater than or equal to 0.');
  }

  details.push(...validateGeo(payload.geo, false));

  details.push(...validateAddress(payload.address, false));
  return details;
}

module.exports = {
  validateCreateProjectPayload,
  validatePatchProjectPayload
};
