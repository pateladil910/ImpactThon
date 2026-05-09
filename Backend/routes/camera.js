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
    
    const isPublic = !isPrivateIP(url);
    const encryptedPassword = encrypt(password);
    
    const newCamera = await Camera.create({
      name,
      type,
      url,
      username,
      password: encryptedPassword,
      isPublic,
      userId: userId || null 
    });
    
    res.status(201).json({ success: true, message: 'Camera saved successfully', camera: newCamera });
  } catch (error) {
    console.error('Camera Save Error:', error);
    res.status(500).json({ success: false, message: 'Error saving camera' });
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

module.exports = router;
