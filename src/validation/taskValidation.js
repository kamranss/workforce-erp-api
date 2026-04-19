const { isValidObjectId } = require('../helpers/timeEntries');
const { TASK_STATUSES, TASK_PRIORITIES } = require('../models/Task');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateAssignedToUserIds(value) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return ['assignedToUserIds must be an array when provided.'];
  }

  const errors = [];
  for (const id of value) {
    if (!isValidObjectId(id)) {
      errors.push('assignedToUserIds must contain only valid ObjectIds.');
      break;
    }
  }

  return errors;
}

function validateTodoItems(value, mode = 'create') {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return ['todoItems must be an array when provided.'];
  }

  const errors = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      errors.push('todoItems must contain only objects.');
      break;
    }

    if (!isNonEmptyString(item.text)) {
      errors.push('todoItems text is required and must be a non-empty string.');
      break;
    }

    if (item.isDone !== undefined && typeof item.isDone !== 'boolean') {
      errors.push('todoItems isDone must be a boolean when provided.');
      break;
    }

    if (item.doneAt !== undefined && item.doneAt !== null && Number.isNaN(new Date(item.doneAt).getTime())) {
      errors.push('todoItems doneAt must be a valid ISO date or null when provided.');
      break;
    }

    if (mode === 'patch' && item.id !== undefined && !isValidObjectId(item.id)) {
      errors.push('todoItems id must be a valid ObjectId when provided.');
      break;
    }
  }

  return errors;
}

function validateCreateTaskPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  if (!isNonEmptyString(payload.title)) {
    details.push('title is required and must be a non-empty string.');
  }

  if (payload.description !== undefined && typeof payload.description !== 'string') {
    details.push('description must be a string when provided.');
  }

  if (payload.address !== undefined && typeof payload.address !== 'string') {
    details.push('address must be a string when provided.');
  }

  if (payload.dueDate !== undefined && Number.isNaN(new Date(payload.dueDate).getTime())) {
    details.push('dueDate must be a valid ISO date when provided.');
  }

  if (payload.startDate !== undefined && Number.isNaN(new Date(payload.startDate).getTime())) {
    details.push('startDate must be a valid ISO date when provided.');
  }

  const startDate = payload.startDate !== undefined ? new Date(payload.startDate) : new Date();
  if (
    payload.dueDate !== undefined &&
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(new Date(payload.dueDate).getTime()) &&
    new Date(payload.dueDate).getTime() < startDate.getTime()
  ) {
    details.push('dueDate must be greater than or equal to startDate.');
  }

  if (payload.status !== undefined && !TASK_STATUSES.includes(payload.status)) {
    details.push('status must be one of: created, progress, done.');
  }

  if (payload.priority !== undefined && !TASK_PRIORITIES.includes(payload.priority)) {
    details.push('priority must be one of: low, medium, high.');
  }

  if (payload.projectId !== undefined && payload.projectId !== null && !isValidObjectId(payload.projectId)) {
    details.push('projectId must be a valid ObjectId when provided.');
  }

  details.push(...validateAssignedToUserIds(payload.assignedToUserIds));
  details.push(...validateTodoItems(payload.todoItems, 'create'));
  return details;
}

function validatePatchTaskPayload(payload) {
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return ['Body must be a JSON object.'];
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return ['At least one field is required for update.'];
  }

  if (payload.title !== undefined && !isNonEmptyString(payload.title)) {
    details.push('title must be a non-empty string when provided.');
  }

  if (payload.description !== undefined && payload.description !== null && typeof payload.description !== 'string') {
    details.push('description must be a string or null when provided.');
  }

  if (payload.address !== undefined && payload.address !== null && typeof payload.address !== 'string') {
    details.push('address must be a string or null when provided.');
  }

  if (payload.dueDate !== undefined && payload.dueDate !== null && Number.isNaN(new Date(payload.dueDate).getTime())) {
    details.push('dueDate must be a valid ISO date or null when provided.');
  }

  if (payload.startDate !== undefined && payload.startDate !== null && Number.isNaN(new Date(payload.startDate).getTime())) {
    details.push('startDate must be a valid ISO date or null when provided.');
  }

  if (payload.status !== undefined && !TASK_STATUSES.includes(payload.status)) {
    details.push('status must be one of: created, progress, done.');
  }

  if (payload.priority !== undefined && payload.priority !== null && !TASK_PRIORITIES.includes(payload.priority)) {
    details.push('priority must be one of: low, medium, high.');
  }

  if (payload.projectId !== undefined && payload.projectId !== null && !isValidObjectId(payload.projectId)) {
    details.push('projectId must be a valid ObjectId or null when provided.');
  }

  details.push(...validateAssignedToUserIds(payload.assignedToUserIds));
  details.push(...validateTodoItems(payload.todoItems, 'patch'));
  return details;
}

module.exports = {
  validateCreateTaskPayload,
  validatePatchTaskPayload
};
