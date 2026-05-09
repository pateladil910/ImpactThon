const mongoose = require('mongoose');

const CameraSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional for testing, set to true in strict production
  },
  name: { type: String, required: true },
  type: { type: String, enum: ['WEBCAM', 'IP_CAMERA', 'RTSP', 'CCTV'], required: true },
  url: { type: String, required: true },
  username: { type: String, default: '' },
  password: { type: String, default: '' }, // Encrypted
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Camera', CameraSchema);
