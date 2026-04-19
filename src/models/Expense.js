const mongoose = require('mongoose');

const EXPENSE_TYPES = [
  'gas',
  'utility',
  'maintenance',
  'vehicle',
  'food',
  'tools',
  'city_expenses',
  'store',
  'storage',
  'archcloset',
  'mobile',
  'referral',
  'material',
  'damage',
  'unknown',
  'other'
];
const EXPENSE_SCOPES = ['project', 'company'];

const expenseSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: EXPENSE_SCOPES,
      default: 'project'
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null
    },
    type: {
      type: String,
      enum: EXPENSE_TYPES,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.000001
    },
    spentAt: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      trim: true
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

expenseSchema.index({ projectId: 1, spentAt: -1 });
expenseSchema.index({ scope: 1, spentAt: -1 });
expenseSchema.index({ spentAt: -1, _id: -1 });

const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);

module.exports = {
  Expense,
  EXPENSE_TYPES,
  EXPENSE_SCOPES
};
