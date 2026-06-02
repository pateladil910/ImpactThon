const mongoose = require('mongoose');

const CameraSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true   // Optional for testing, set to true in strict production
  },
  name: { type: String, required: true },
  type: { type: String, enum: ['WEBCAM', 'IP_CAMERA', 'RTSP', 'CCTV'], required: true },
  url: { type: String, required: true },
  username: { type: String, default: '' },
  password: { type: String, default: '' }, // Encrypted
  isPublic: { type: Boolean, default: false },
  factory: { type: String, default: 'Factory A' },
  mapX: { type: Number, default: 50 },
  mapY: { type: Number, default: 50 },
  brand: { type: String, enum: ['Hikvision', 'Dahua', 'CP Plus', 'Axis', 'Bosch', 'ONVIF', 'Generic'], default: 'Generic' },
  channelId: { type: Number, default: 1 },
  status: { type: String, enum: ['Online', 'Offline', 'No Signal', 'Auth Failed', 'Timeout'], default: 'Offline' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Camera', CameraSchema);
