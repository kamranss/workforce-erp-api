const mongoose = require('mongoose');

const PROJECT_STATUSES = ['waiting', 'ongoing', 'finished', 'canceled'];

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
      default: 500,
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
