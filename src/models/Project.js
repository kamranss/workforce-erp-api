const mongoose = require('mongoose');

const PROJECT_STATUSES = ['waiting', 'ongoing', 'review', 'finished', 'canceled'];

const projectSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      required: true,
      default: 'waiting'
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    },
    quoteNumber: {
      type: String,
      trim: true
    },
    quoteAmount: {
      type: Number,
      min: 0
    },
    referralPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    materials: {
      type: String,
      trim: true
    },
    clientFullName: {
      type: String,
      trim: true
    },
    clientPhone: {
      type: String,
      trim: true
    },
    clientEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    estimatedStartAt: {
      type: Date
    },
    actualStartAt: {
      type: Date,
      default: null
    },
    actualEndAt: {
      type: Date,
      default: null
    },
    actualDurationDays: {
      type: Number,
      default: null,
      min: 0
    },
    locationKey: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      raw: {
        type: String,
        required: true,
        trim: true
      },
      normalized: {
        type: String,
        trim: true
      },
      lat: {
        type: Number
      },
      lng: {
        type: Number
      }
    },
    geo: {
      lat: {
        type: Number
      },
      lng: {
        type: Number
      }
    },
    geoRadiusMeters: {
      type: Number,
      default: 600,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

projectSchema.index({ status: 1, createdAt: -1 });
projectSchema.index({ isActive: 1, createdAt: -1 });
projectSchema.index({ locationKey: 1 });
projectSchema.index({ customerId: 1, createdAt: -1 });
projectSchema.index({
  description: 'text',
  materials: 'text',
  'address.raw': 'text',
  'address.normalized': 'text',
  quoteNumber: 'text'
});

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

module.exports = {
  Project,
  PROJECT_STATUSES
};
