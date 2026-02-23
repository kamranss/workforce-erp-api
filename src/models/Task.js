const mongoose = require('mongoose');

const TASK_STATUSES = ['created', 'progress', 'done'];
const ASSIGNED_ROLES = ['admin', 'user'];

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
    dueDate: {
      type: Date,
      default: null
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
  ASSIGNED_ROLES
};
