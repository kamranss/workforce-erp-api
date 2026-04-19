const { EXPENSE_SCOPES, EXPENSE_TYPES } = require('../models/Expense');
const { isValidObjectId } = require('../helpers/timeEntries');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatExpenseTypesList() {
  return EXPENSE_TYPES.join(', ');
}

function validateCreateExpensePayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const scope = payload.scope === undefined ? 'project' : payload.scope;
  if (!EXPENSE_SCOPES.includes(scope)) {
    details.push('scope must be one of: project, company.');
  }

  if (scope === 'project' && !isValidObjectId(payload.projectId)) {
    details.push('projectId is required and must be a valid ObjectId when scope=project.');
  }

  if (scope === 'company' && payload.projectId !== undefined && payload.projectId !== null && !isValidObjectId(payload.projectId)) {
    details.push('projectId must be a valid ObjectId when provided.');
  }

  if (!EXPENSE_TYPES.includes(payload.type)) {
    details.push(`type is required and must be one of: ${formatExpenseTypesList()}.`);
  }

  if (!isFiniteNumber(payload.amount) || payload.amount <= 0) {
    details.push('amount is required and must be greater than 0.');
  }

  if (payload.spentAt !== undefined && Number.isNaN(new Date(payload.spentAt).getTime())) {
    details.push('spentAt must be a valid ISO date when provided.');
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    details.push('notes must be a string when provided.');
  }

  return details;
}

function validatePatchExpensePayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.scope !== undefined && !EXPENSE_SCOPES.includes(payload.scope)) {
    details.push('scope must be one of: project, company.');
  }

  if (payload.projectId !== undefined && payload.projectId !== null && !isValidObjectId(payload.projectId)) {
    details.push('projectId must be a valid ObjectId when provided.');
  }

  if (payload.type !== undefined && !EXPENSE_TYPES.includes(payload.type)) {
    details.push(`type must be one of: ${formatExpenseTypesList()}.`);
  }

  if (payload.amount !== undefined && (!isFiniteNumber(payload.amount) || payload.amount <= 0)) {
    details.push('amount must be greater than 0 when provided.');
  }

  if (payload.spentAt !== undefined && Number.isNaN(new Date(payload.spentAt).getTime())) {
    details.push('spentAt must be a valid ISO date when provided.');
  }

  if (payload.notes !== undefined && payload.notes !== null && typeof payload.notes !== 'string') {
    details.push('notes must be a string or null when provided.');
  }

  return details;
}

module.exports = {
  validateCreateExpensePayload,
  validatePatchExpensePayload
};
