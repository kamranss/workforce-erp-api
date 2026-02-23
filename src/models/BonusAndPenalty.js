const mongoose = require('mongoose');

const bonusAndPenaltySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      trim: true
    },
    effectiveAt: {
      type: Date,
      default: Date.now
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

bonusAndPenaltySchema.index({ userId: 1, effectiveAt: -1 });
bonusAndPenaltySchema.index({ effectiveAt: -1, _id: -1 });

const BonusAndPenalty =
  mongoose.models.BonusAndPenalty ||
  mongoose.model('BonusAndPenalty', bonusAndPenaltySchema);

module.exports = {
  BonusAndPenalty
};
