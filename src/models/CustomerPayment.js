const mongoose = require('mongoose');

const CUSTOMER_PAYMENT_TYPES = ['main_work', 'material', 'other', 'unknown'];

const customerPaymentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    amount: {
      type: Number,
      required: true,
      min: 0.000001
    },
    type: {
      type: String,
      enum: CUSTOMER_PAYMENT_TYPES,
      default: 'main_work'
    },
    paidAt: {
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

customerPaymentSchema.index({ projectId: 1, paidAt: -1 });
customerPaymentSchema.index({ customerId: 1, paidAt: -1 });
customerPaymentSchema.index({ paidAt: -1, _id: -1 });

const CustomerPayment =
  mongoose.models.CustomerPayment || mongoose.model('CustomerPayment', customerPaymentSchema);

module.exports = {
  CustomerPayment,
  CUSTOMER_PAYMENT_TYPES
};
