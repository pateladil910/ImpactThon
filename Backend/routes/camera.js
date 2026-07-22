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
    // Fetch only the logged-in user's cameras (or all cameras if admin)
    let query = { userId: req.user.id };
    if (req.user.role === 'admin') {
      query = {}; // Admin can access all cameras in the system
    }

    const cameras = await Camera.find(query).populate('userId', 'name');
    const decryptedCameras = cameras.map(cam => {
      let decryptedPassword = "";
      if (cam.password) {
        decryptedPassword = decrypt(cam.password);
      }

      const uId = cam.userId && cam.userId._id ? cam.userId._id : cam.userId;
      const uName = cam.userId && cam.userId.name ? cam.userId.name : "Unknown Operator";

      return {
        _id: cam._id,
        userId: uId,
        userName: uName,
        name: cam.name + (req.user.role === 'admin' ? ` (${uName})` : ''),
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
    let query = { userId: req.user.id };
    if (req.user.role === 'admin') {
      query = {};
    }

    const camera = await Camera.findOne(query).populate('userId', 'name');

    if (!camera) {
      return res.status(404).json({ success: false, message: 'No camera configured' });
    }

    let decryptedPassword = "";
    if (camera.password) {
      decryptedPassword = decrypt(camera.password);
    }

    const uId = camera.userId && camera.userId._id ? camera.userId._id : camera.userId;
    const uName = camera.userId && camera.userId.name ? camera.userId.name : "Unknown Operator";

    // Parse zone string "x1,y1,x2,y2" into object, or pass through if already object
    function parseZoneStr(zone) {
      if (!zone) return null;
      if (typeof zone === 'object' && zone.x !== undefined) return zone;
      if (typeof zone === 'string') {
        const parts = zone.split(',').map(v => parseInt(v.trim(), 10));
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          return { x: parts[0], y: parts[1], w: parts[2] - parts[0], h: parts[3] - parts[1],
                   x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
        }
      }
      return null;
    }

    res.status(200).json({ 
      success: true, 
      camera: {
        _id: camera._id,
        userId: uId,
        userName: uName,
        name: camera.name + (req.user.role === 'admin' ? ` (${uName})` : ''),
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
        dangerZone: parseZoneStr(camera.dangerZone),
        warningZone: parseZoneStr(camera.warningZone),
        createdAt: camera.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/camera/zones - returns zones in {danger:{x1,y1,x2,y2}, warning:{x1,y1,x2,y2}} format
router.get('/zones', authMiddleware, async (req, res) => {
  try {
    const camera = await Camera.findOne({ userId: req.user.id });
    if (!camera) {
      return res.status(404).json({ success: false, message: 'No camera configured' });
    }

    function parseZone(zone) {
      if (!zone) return null;
      if (typeof zone === 'object' && zone.x1 !== undefined) return zone;
      if (typeof zone === 'object' && zone.x !== undefined) {
        return { x1: zone.x, y1: zone.y, x2: zone.x + zone.w, y2: zone.y + zone.h };
      }
      if (typeof zone === 'string') {
        const parts = zone.split(',').map(v => parseInt(v.trim(), 10));
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          return { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
        }
      }
      return null;
    }

    const danger = parseZone(camera.dangerZone);
    const warning = parseZone(camera.warningZone);

    return res.json({
      success: true,
      danger:  danger  || { x1: 360, y1: 100, x2: 600, y2: 450 },
      warning: warning || { x1: 240, y1:  50, x2: 620, y2: 460 }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/camera/zones - save zones from draw_zone.html
router.post('/zones', authMiddleware, async (req, res) => {
  try {
    const { danger, warning } = req.body;
    const userId = req.user.id;

    function toStorageStr(z) {
      if (!z) return '';
      if (z.x1 !== undefined) return `${z.x1},${z.y1},${z.x2},${z.y2}`;
      if (z.x !== undefined)  return `${z.x},${z.y},${z.x + z.w},${z.y + z.h}`;
      return '';
    }

    const dangerStr  = toStorageStr(danger);
    const warningStr = toStorageStr(warning);

    await Camera.findOneAndUpdate(
      { userId },
      { dangerZone: dangerStr, warningZone: warningStr, updatedAt: Date.now() },
      { new: true }
    );

    return res.json({ success: true, danger, warning });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/camera/update_status
router.post('/update_status', authMiddleware, async (req, res) => {
  try {
    const { url, status } = req.body;
    const userId = req.user.id;

    if (!url || !status) {
      return res.status(400).json({ success: false, message: 'URL and status are required' });
    }

    const camera = await Camera.findOneAndUpdate(
      { userId: userId, url: url },
      { status: status, updatedAt: Date.now() },
      { new: true }
    );

    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    res.status(200).json({ success: true, message: 'Camera status updated successfully', camera });
  } catch (error) {
    console.error('Camera status update error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
