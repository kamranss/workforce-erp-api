const { isValidObjectId } = require('../helpers/timeEntries');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateGeoPoint(value, fieldName) {
  const details = [];

  if (!value || typeof value !== 'object') {
    return [`${fieldName} is required and must be an object.`];
  }

  if (!isFiniteNumber(value.lat)) {
    details.push(`${fieldName}.lat must be a valid number.`);
  }

  if (!isFiniteNumber(value.lng)) {
    details.push(`${fieldName}.lng must be a valid number.`);
  }

  return details;
}

function validateCheckInPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const projectIdIn = payload.projectIdIn || payload.projectId;
  if (projectIdIn !== undefined && projectIdIn !== null && !isValidObjectId(projectIdIn)) {
    details.push('projectIdIn (or projectId) must be a valid ObjectId when provided.');
  }

  details.push(...validateGeoPoint(payload.geoIn, 'geoIn'));

  if (payload.addrIn !== undefined && typeof payload.addrIn !== 'string') {
    details.push('addrIn must be a string when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validateCheckOutPayload(payload, options = {}) {
  const details = [];
  const allowMissingProjectIdOut = options.allowMissingProjectIdOut === true;

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (allowMissingProjectIdOut) {
    if (
      payload.projectIdOut !== undefined &&
      payload.projectIdOut !== null &&
      !isValidObjectId(payload.projectIdOut)
    ) {
      details.push('projectIdOut must be a valid ObjectId when provided.');
    }
  } else if (!isValidObjectId(payload.projectIdOut)) {
    details.push('projectIdOut is required and must be a valid ObjectId.');
  }

  details.push(...validateGeoPoint(payload.geoOut, 'geoOut'));

  if (payload.addrOut !== undefined && typeof payload.addrOut !== 'string') {
    details.push('addrOut must be a string when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validateAdminCreatePayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidObjectId(payload.userId)) {
    details.push('userId is required and must be a valid ObjectId.');
  }

  if (!isValidObjectId(payload.projectIdIn)) {
    details.push('projectIdIn is required and must be a valid ObjectId.');
  }

  if (!payload.clockInAt || Number.isNaN(new Date(payload.clockInAt).getTime())) {
    details.push('clockInAt is required and must be a valid ISO date.');
  }

  if (payload.clockOutAt !== undefined && Number.isNaN(new Date(payload.clockOutAt).getTime())) {
    details.push('clockOutAt must be a valid ISO date when provided.');
  }

  if (payload.projectIdOut !== undefined && !isValidObjectId(payload.projectIdOut)) {
    details.push('projectIdOut must be a valid ObjectId when provided.');
  }

  if (payload.geoIn !== undefined) {
    details.push(...validateGeoPoint(payload.geoIn, 'geoIn'));
  }

  if (payload.geoOut !== undefined) {
    details.push(...validateGeoPoint(payload.geoOut, 'geoOut'));
  }

  if (payload.addrIn !== undefined && typeof payload.addrIn !== 'string') {
    details.push('addrIn must be a string when provided.');
  }

  if (payload.addrOut !== undefined && typeof payload.addrOut !== 'string') {
    details.push('addrOut must be a string when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validateAdminPatchPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.projectIdIn !== undefined && !isValidObjectId(payload.projectIdIn)) {
    details.push('projectIdIn must be a valid ObjectId when provided.');
  }

  if (payload.projectIdOut !== undefined && payload.projectIdOut !== null && !isValidObjectId(payload.projectIdOut)) {
    details.push('projectIdOut must be a valid ObjectId or null when provided.');
  }

  if (payload.clockInAt !== undefined && Number.isNaN(new Date(payload.clockInAt).getTime())) {
    details.push('clockInAt must be a valid ISO date when provided.');
  }

  if (payload.clockOutAt !== undefined && payload.clockOutAt !== null && Number.isNaN(new Date(payload.clockOutAt).getTime())) {
    details.push('clockOutAt must be a valid ISO date or null when provided.');
  }

  if (payload.geoIn !== undefined && payload.geoIn !== null) {
    details.push(...validateGeoPoint(payload.geoIn, 'geoIn'));
  }

  if (payload.geoOut !== undefined && payload.geoOut !== null) {
    details.push(...validateGeoPoint(payload.geoOut, 'geoOut'));
  }

  if (payload.addrIn !== undefined && payload.addrIn !== null && typeof payload.addrIn !== 'string') {
    details.push('addrIn must be a string or null when provided.');
  }

  if (payload.addrOut !== undefined && payload.addrOut !== null && typeof payload.addrOut !== 'string') {
    details.push('addrOut must be a string or null when provided.');
  }

  if (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== 'string') {
    details.push('notes must be a string or null when provided.');
  }

  return details;
}

module.exports = {
  validateCheckInPayload,
  validateCheckOutPayload,
  validateAdminCreatePayload,
  validateAdminPatchPayload
};
