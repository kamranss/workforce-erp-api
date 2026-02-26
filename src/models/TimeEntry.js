const mongoose = require('mongoose');

const geoPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  { _id: false }
);

const timeEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    projectIdIn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    projectIdOut: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null
    },
    // Legacy field kept for backwards compatibility with old documents.
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null
    },
    clockInAt: {
      type: Date,
      required: true
    },
    clockOutAt: {
      type: Date,
      default: null
    },
    breakMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    rawMinutes: {
      type: Number,
      default: null,
      min: 0
    },
    minutesWorked: {
      type: Number,
      default: null,
      min: 0
    },
    hourlyRateAtTime: {
      type: Number,
      default: null
    },
    geoIn: {
      type: geoPointSchema,
      default: null
    },
    geoOut: {
      type: geoPointSchema,
      default: null
    },
    addrIn: {
      type: String,
      trim: true
    },
    addrOut: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    edited: {
      type: Boolean,
      default: false
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

timeEntrySchema.index({ userId: 1, clockOutAt: 1, isDeleted: 1 });
timeEntrySchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { clockOutAt: null } }
);
timeEntrySchema.index({ projectIdIn: 1, createdAt: -1 });
timeEntrySchema.index({ projectIdOut: 1, createdAt: -1 });
timeEntrySchema.index({ createdAt: -1, _id: -1 });

const TimeEntry = mongoose.models.TimeEntry || mongoose.model('TimeEntry', timeEntrySchema);

module.exports = {
  TimeEntry
};
