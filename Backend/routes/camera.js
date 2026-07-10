const express = require('express');
const router = express.Router();
const Camera = require('../models/Camera');
const authMiddleware = require('../middleware/authMiddleware');
const crypto = require('crypto');

// Utility to check if IP is private/local
function isPrivateIP(urlStr) {
  if (!urlStr) return false;
  try {
    let cleanUrl = urlStr.toLowerCase().trim();
    
    // Extract host/ip
    // 1. Remove protocol schema
    cleanUrl = cleanUrl.replace(/^(rtsp|rtmp|http|https):\/\//, '');
    // 2. Remove credentials if present (anything before last '@')
    if (cleanUrl.includes('@')) {
      cleanUrl = cleanUrl.substring(cleanUrl.lastIndexOf('@') + 1);
    }
    // 3. Remove port and path (anything starting with ':' or '/')
    const endIdx = cleanUrl.search(/[:\/]/);
    if (endIdx !== -1) {
      cleanUrl = cleanUrl.substring(0, endIdx);
    }
    
    // Pure digit check (e.g. USB index "0", "1")
    if (/^\d+$/.test(cleanUrl)) return true;
    
    if (cleanUrl === 'localhost' || cleanUrl === '127.0.0.1') return true;
    if (cleanUrl.startsWith('192.168.')) return true;
    if (cleanUrl.startsWith('10.')) return true;
    
    // Match 172.16.x.x to 172.31.x.x
    const match = cleanUrl.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
    if (match) return true;
    
    return false;
  } catch (e) {
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

function decrypt(text) {
  if (!text) return '';
  try {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("AES Decryption Error:", err.message);
    return '';
  }
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
router.post('/save', authMiddleware, async (req, res) => {
  try {
    const { name, type, url, username, password, factory, mapX, mapY, brand, channelId, status, dangerZone, warningZone } = req.body;
    const userId = req.user.id;

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

    // UPSERT LOGIC: This updates the camera belonging to the current user and url, or creates it if not.
    const camera = await Camera.findOneAndUpdate(
      { userId: userId, url: url }, // Scoped to logged-in user and camera URL
      {
        name,
        type, // Set schema type field
        url,
        username,
        password: encryptedPassword,
        isPublic,
        factory: factory || 'Factory A',
        mapX: mapX !== undefined ? Number(mapX) : 50,
        mapY: mapY !== undefined ? Number(mapY) : 50,
        brand: brand || 'Generic',
        channelId: channelId !== undefined ? Number(channelId) : 1,
        status: status || 'Offline',
        dangerZone: dangerZone || '',
        warningZone: warningZone || '',
        updatedAt: Date.now()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, message: 'Camera saved successfully!', camera });
  } catch (error) {
    console.error('CRITICAL SAVE ERROR:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/camera/update_coordinates
router.post('/update_coordinates', authMiddleware, async (req, res) => {
  try {
    const { url, mapX, mapY } = req.body;
    const userId = req.user.id;

    if (!url || mapX === undefined || mapY === undefined) {
      return res.status(400).json({ success: false, message: 'URL, mapX, and mapY are required' });
    }

    const camera = await Camera.findOneAndUpdate(
      { userId: userId, url: url },
      { mapX: Number(mapX), mapY: Number(mapY), updatedAt: Date.now() },
      { new: true }
    );

    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    res.status(200).json({ success: true, message: 'Coordinates updated successfully', camera });
  } catch (error) {
    console.error('Coordinates update error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/camera/reset
router.delete('/reset', authMiddleware, async (req, res) => {
  try {
    const { url } = req.query;
    if (url) {
      // Delete specific camera
      await Camera.deleteOne({ userId: req.user.id, url: url });
      console.log(`MongoDB: Camera cleared for user ${req.user.id} and URL ${url}`);
    } else {
      // Delete all cameras
      await Camera.deleteMany({ userId: req.user.id });
      console.log(`MongoDB: All cameras cleared for user ${req.user.id}`);
    }
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
router.get('/all', authMiddleware, async (req, res) => {
  try {
    // Fetch only the logged-in user's cameras
    const cameras = await Camera.find({ userId: req.user.id });
    const decryptedCameras = cameras.map(cam => {
      let decryptedPassword = "";
      if (cam.password) {
        decryptedPassword = decrypt(cam.password);
      }
      return {
        _id: cam._id,
        userId: cam.userId,
        name: cam.name,
        type: cam.type,
        cameraType: cam.type,
        url: cam.url,
        username: cam.username,
        password: decryptedPassword,
        isPublic: cam.isPublic,
        factory: cam.factory || 'Factory A',
        mapX: cam.mapX !== undefined ? cam.mapX : 50,
        mapY: cam.mapY !== undefined ? cam.mapY : 50,
        brand: cam.brand || 'Generic',
        channelId: cam.channelId !== undefined ? cam.channelId : 1,
        status: cam.status || 'Offline',
        createdAt: cam.createdAt
      };
    });
    res.status(200).json({ success: true, cameras: decryptedCameras });
  } catch (error) {
    console.error('Fetch Cameras Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/latest', authMiddleware, async (req, res) => {
  try {
    // Fetch only the logged-in user's camera
    const camera = await Camera.findOne({ userId: req.user.id });

    if (!camera) {
      return res.status(404).json({ success: false, message: 'No camera configured' });
    }

    let decryptedPassword = "";
    if (camera.password) {
      decryptedPassword = decrypt(camera.password);
    }

    res.status(200).json({ 
      success: true, 
      camera: {
        _id: camera._id,
        userId: camera.userId,
        name: camera.name,
        type: camera.type,
        cameraType: camera.type,
        url: camera.url,
        username: camera.username,
        password: decryptedPassword,
        isPublic: camera.isPublic,
        factory: camera.factory || 'Factory A',
        mapX: camera.mapX !== undefined ? camera.mapX : 50,
        mapY: camera.mapY !== undefined ? camera.mapY : 50,
        brand: camera.brand || 'Generic',
        channelId: camera.channelId !== undefined ? camera.channelId : 1,
        status: camera.status || 'Offline',
        createdAt: camera.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
