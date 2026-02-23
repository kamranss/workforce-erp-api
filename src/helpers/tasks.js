const mongoose = require('mongoose');

const TASK_DUE_MAX_DATE = new Date('9999-12-31T23:59:59.999Z');

function toTaskResponse(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    address: doc.address,
    dueDate: doc.dueDate,
    status: doc.status,
    projectId: doc.projectId ? String(doc.projectId) : null,
    assignedToRole: doc.assignedToRole,
    assignedToUserIds: (doc.assignedToUserIds || []).map((id) => String(id)),
    createdBy: String(doc.createdBy),
    isDeleted: doc.isDeleted === true,
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy ? String(doc.deletedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function encodeTaskCursor(doc) {
  const payload = {
    dueDateSort: (doc.dueDate || TASK_DUE_MAX_DATE).toISOString(),
    createdAt: doc.createdAt.toISOString(),
    id: String(doc._id)
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeTaskCursor(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const raw = Buffer.from(value, 'base64url').toString('utf8');
    const payload = JSON.parse(raw);
    const dueDateSort = new Date(payload.dueDateSort);
    const createdAt = new Date(payload.createdAt);

    if (
      Number.isNaN(dueDateSort.getTime()) ||
      Number.isNaN(createdAt.getTime()) ||
      !mongoose.Types.ObjectId.isValid(payload.id)
    ) {
      return null;
    }

    return {
      dueDateSort,
      createdAt,
      id: payload.id
    };
  } catch (error) {
    return null;
  }
}

function buildTaskCursorMatch(cursor) {
  if (!cursor) {
    return null;
  }

  return {
    $or: [
      { dueDateSort: { $gt: cursor.dueDateSort } },
      {
        dueDateSort: cursor.dueDateSort,
        createdAt: { $lt: cursor.createdAt }
      },
      {
        dueDateSort: cursor.dueDateSort,
        createdAt: cursor.createdAt,
        _id: { $lt: new mongoose.Types.ObjectId(cursor.id) }
      }
    ]
  };
}

module.exports = {
  TASK_DUE_MAX_DATE,
  toTaskResponse,
  encodeTaskCursor,
  decodeTaskCursor,
  buildTaskCursorMatch
};
