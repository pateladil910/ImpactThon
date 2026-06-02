const mongoose = require("mongoose");

const IncidentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    type: {
      type: String,
      required: true,
    },
    breachType: {
      type: String,
      enum: ['PROXIMITY', 'NO_HELMET', 'NO_VEST', 'ZONE_INTRUSION', 'UNKNOWN'],
      default: 'PROXIMITY'
    },
    confidence: {
      type: Number,
      required: true,
    },
    camera: {
      type: String,
      required: true,
    },
    factory: {
      type: String,
      default: 'Factory A'
    },
    severity: {
      type: String,
      enum: ['SAFE', 'WARNING', 'DANGER', 'ALARM'],
      default: 'DANGER'
    },
    snapshotUrl: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "incidents" }
);

module.exports = mongoose.model("Incident", IncidentSchema);
