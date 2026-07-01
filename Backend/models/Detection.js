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
    photo_base64: String,
    email_status: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId, // Connects to the actual ID
      ref: 'User',                          // Refers to your User collection
      required: false
    }
  },
  { collection: 'history' }
);

module.exports = mongoose.model("Detection", DetectionSchema);
