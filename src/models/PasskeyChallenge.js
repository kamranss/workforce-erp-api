const mongoose = require('mongoose');

const CHALLENGE_ACTIONS = ['register', 'login'];

const passkeyChallengeSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: CHALLENGE_ACTIONS,
      required: true
    },
    challenge: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'passkey_challenges'
  }
);

passkeyChallengeSchema.index({ action: 1, challenge: 1 }, { unique: true });
passkeyChallengeSchema.index({ userId: 1, action: 1, createdAt: -1 });
passkeyChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasskeyChallenge =
  mongoose.models.PasskeyChallenge || mongoose.model('PasskeyChallenge', passkeyChallengeSchema);

module.exports = {
  PasskeyChallenge,
  CHALLENGE_ACTIONS
};
