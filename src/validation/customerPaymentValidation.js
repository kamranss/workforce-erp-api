const { isValidObjectId } = require('../helpers/timeEntries');
const { CUSTOMER_PAYMENT_TYPES } = require('../models/CustomerPayment');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCreateCustomerPaymentPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isValidObjectId(payload.projectId)) {
    details.push('projectId is required and must be a valid ObjectId.');
  }

  if (!isFiniteNumber(payload.amount) || payload.amount <= 0) {
    details.push('amount is required and must be greater than 0.');
  }

  if (payload.type !== undefined && !CUSTOMER_PAYMENT_TYPES.includes(payload.type)) {
    details.push('type must be one of: main_work, material, other, unknown.');
  }

  if (payload.paidAt !== undefined && Number.isNaN(new Date(payload.paidAt).getTime())) {
    details.push('paidAt must be a valid ISO date when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validatePatchCustomerPaymentPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.projectId !== undefined && !isValidObjectId(payload.projectId)) {
    details.push('projectId must be a valid ObjectId when provided.');
  }

  if (payload.amount !== undefined && (!isFiniteNumber(payload.amount) || payload.amount <= 0)) {
    details.push('amount must be greater than 0 when provided.');
  }

  if (payload.type !== undefined && !CUSTOMER_PAYMENT_TYPES.includes(payload.type)) {
    details.push('type must be one of: main_work, material, other, unknown.');
  }

  if (payload.paidAt !== undefined && Number.isNaN(new Date(payload.paidAt).getTime())) {
    details.push('paidAt must be a valid ISO date when provided.');
  }

  if (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== 'string') {
    details.push('notes must be a string or null when provided.');
  }

  return details;
}

module.exports = {
  validateCreateCustomerPaymentPayload,
  validatePatchCustomerPaymentPayload
};
