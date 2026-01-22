const mongoose = require("mongoose");

const IncidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
    },
    camera: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "incidents" }
);

module.exports = mongoose.model("Incident", IncidentSchema);
