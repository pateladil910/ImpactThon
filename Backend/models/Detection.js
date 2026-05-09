const mongoose = require("mongoose");

const DetectionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["SAFE", "DANGER"],
      required: true
    },
    message: String,
    timestamp: {
      type: Date,
      required: true
    },
    event: String,
    timestamp_ist: String,
    userId: {
      type: String,
      default: "system"
    }
  },
  { collection: 'history' }
);

module.exports = mongoose.model("Detection", DetectionSchema);
