const mongoose = require('mongoose');

const userPasskeySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    credentialId: {
      type: String,
      required: true,
      unique: true
    },
    publicKey: {
      type: Buffer,
      required: true
    },
    counter: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    transports: {
      type: [String],
      default: []
    },
    deviceType: {
      type: String,
      default: null
    },
    backedUp: {
      type: Boolean,
      default: null
    },
    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'user_passkeys'
  }
);

userPasskeySchema.index({ credentialId: 1 }, { unique: true });
userPasskeySchema.index({ userId: 1, createdAt: -1 });

const UserPasskey =
  mongoose.models.UserPasskey || mongoose.model('UserPasskey', userPasskeySchema);

module.exports = {
  UserPasskey
};
