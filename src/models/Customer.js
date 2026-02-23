const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
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

customerSchema.index({ fullName: 1, createdAt: -1 });
customerSchema.index({ email: 1 });
customerSchema.index({ isDeleted: 1, createdAt: -1 });

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);

module.exports = {
  Customer
};
