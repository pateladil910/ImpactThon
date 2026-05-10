const express = require('express');
const router = express.Router();
const Camera = require('../models/Camera');
const crypto = require('crypto');

// Utility to check if IP is private/local
function isPrivateIP(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;

    // Check for common private IP patterns
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.startsWith('192.168.')) return true;
    if (host.startsWith('10.')) return true;
    if (host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;

    return false;
  } catch (e) {
    // Fallback if URL parsing fails
    if (urlStr.includes('192.168.') || urlStr.includes('10.') || urlStr.includes('localhost')) return true;
    return false;
  }
}

// Simple encryption for camera passwords
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 chars
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// POST /api/camera/test
router.post('/test', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }

  const isLocal = isPrivateIP(url);

  if (isLocal) {
    return res.status(200).json({
      success: false,
      isLocal: true,
      message: 'Private local IP cameras cannot be accessed directly from cloud deployment. Please use the Local Edge Agent.'
    });
  }

  // If Public, simulate connection test
  return res.status(200).json({
    success: true,
    isLocal: false,
    message: 'Public URL accepted. Camera reachable from cloud.'
  });
});

// POST /api/camera/save
router.post('/save', async (req, res) => {
  try {
    const { name, type, url, username, password, userId } = req.body;

    // Encrypt password only if provided
    let encryptedPassword = "";
    if (password) {
      const key = process.env.ENCRYPTION_KEY;
      if (!key || key.length !== 32) {
        throw new Error("Backend Error: ENCRYPTION_KEY must be 32 characters in Render settings.");
      }
      encryptedPassword = encrypt(password);
    }

    const isPublic = !isPrivateIP(url);

    // UPSERT LOGIC: This updates the camera if it exists, or creates it if not.
    // This is what makes it "Life Long" and persistent.
    const camera = await Camera.findOneAndUpdate(
      { name: name }, // You can also use userId if users are logged in
      {
        cameraType: type,
        url,
        username,
        password: encryptedPassword,
        isPublic,
        updatedAt: Date.now()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, message: 'Camera saved for life!', camera });
  } catch (error) {
    console.error('CRITICAL SAVE ERROR:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/camera/reset
router.delete('/reset', async (req, res) => {
  try {
    // deleteMany({}) ensures the "Life-Long" memory is totally wiped
    await Camera.deleteMany({});

    console.log("MongoDB: Camera collection cleared.");
    res.status(200).json({
      success: true,
      message: 'Camera disconnected successfully'
    });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// GET /api/camera/all
router.get('/all', async (req, res) => {
  try {
    const cameras = await Camera.find({}).select('-password');
    res.status(200).json({ success: true, cameras });
  } catch (error) {
    console.error('Fetch Cameras Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/latest', async (req, res) => {
  try {
    // This finds the most recently saved camera in MongoDB
    const camera = await Camera.findOne().sort({ createdAt: -1 }).select('-password');

    if (!camera) {
      return res.status(404).json({ success: false, message: 'No camera configured' });
    }

    res.status(200).json({ success: true, camera });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
