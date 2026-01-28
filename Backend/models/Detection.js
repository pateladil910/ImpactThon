const mongoose = require("mongoose");

const DetectionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["SAFE", "DANGER"],
      required: true
    },
    message: String
  },
  { timestamps: true } // 👈 VERY IMPORTANT
);

module.exports = mongoose.model("Detection", DetectionSchema);
