const mongoose = require('mongoose');

const TASK_DUE_MAX_DATE = new Date('9999-12-31T23:59:59.999Z');

function toIdString(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value._id) {
    return String(value._id);
  }

  return String(value);
}

function toAssignedToUsers(doc) {
  const rawUsers = Array.isArray(doc.assignedToUsers)
    ? doc.assignedToUsers
    : Array.isArray(doc.assignedToUserIds)
    ? doc.assignedToUserIds.filter((item) => item && typeof item === 'object' && item.name !== undefined)
    : [];

  return rawUsers
    .map((user) => {
      const id = toIdString(user);
      if (!id) {
        return null;
      }

      return {
        id,
        name: user.name || null,
        surname: user.surname || null,
        email: user.email || null
      };
    })
    .filter(Boolean);
}

function toTodoItemResponse(item) {
  if (!item) {
    return null;
  }

  const doneBy =
    item.doneBy && typeof item.doneBy === 'object' && item.doneBy._id ? item.doneBy : null;

  return {
    id: toIdString(item._id),
    text: item.text || null,
    isDone: item.isDone === true,
    doneAt: item.doneAt || null,
    doneBy: doneBy
      ? {
          id: String(doneBy._id),
          name: doneBy.name || null,
          surname: doneBy.surname || null,
          email: doneBy.email || null
        }
      : item.doneBy
      ? { id: toIdString(item.doneBy), name: null, surname: null, email: null }
      : null
  };
}

function toTaskResponse(doc) {
  const todoItems = (doc.todoItems || []).map(toTodoItemResponse).filter(Boolean);
  const todoDoneCount = todoItems.filter((item) => item.isDone).length;
  const todoTotalCount = todoItems.length;

  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    address: doc.address,
    startDate: doc.startDate || doc.createdAt || null,
    dueDate: doc.dueDate,
    priority: doc.priority || 'medium',
    status: doc.status,
    projectId: doc.projectId ? String(doc.projectId) : null,
    assignedToRole: doc.assignedToRole,
    assignedToUserIds: (doc.assignedToUserIds || []).map((id) => toIdString(id)).filter(Boolean),
    assignedToUsers: toAssignedToUsers(doc),
    todoItems,
    todoTotalCount,
    todoDoneCount,
    todoProgressPercent:
      todoTotalCount > 0 ? Number(((todoDoneCount / todoTotalCount) * 100).toFixed(2)) : 0,
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
