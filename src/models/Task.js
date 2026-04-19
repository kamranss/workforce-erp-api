const mongoose = require('mongoose');

const TASK_STATUSES = ['created', 'progress', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const ASSIGNED_ROLES = ['admin', 'user'];

const todoItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true
    },
    isDone: {
      type: Boolean,
      default: false
    },
    doneAt: {
      type: Date,
      default: null
    },
    doneBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    _id: true
  }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date,
      default: null
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'medium'
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'created'
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null
    },
    assignedToRole: {
      type: String,
      enum: ASSIGNED_ROLES,
      default: 'admin'
    },
    assignedToUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    todoItems: {
      type: [todoItemSchema],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignedToUserIds: 1 });
taskSchema.index({ createdAt: -1 });

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

module.exports = {
  Task,
  TASK_STATUSES,
  TASK_PRIORITIES,
  ASSIGNED_ROLES
};
