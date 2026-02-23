const mongoose = require('mongoose');

const USER_ROLES = ['superAdmin', 'admin', 'user'];
const PAYMENT_OPTIONS = ['hourly', 'monthly'];
const PASSCODE_REGEX = /^\d{6}$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    surname: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passCodeHash: {
      type: String,
      required: true,
      select: false
    },
    passCodeLookup: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true
    },
    paymentOption: {
      type: String,
      enum: PAYMENT_OPTIONS,
      required: true
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 0
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// NOTE:
// - Raw passCode is never stored in MongoDB.
// - passCodeHash stores bcrypt hash.
// - passCodeLookup stores sha256(passCode) for indexed login pre-filtering.
// - The 6-digit numeric constraint is enforced on input before hashing.
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ passCodeLookup: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_ROLES,
  PAYMENT_OPTIONS,
  PASSCODE_REGEX
};
