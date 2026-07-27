const express = require("express");
const User = require("../models/User");
const Detection = require("../models/Detection");
const Incident = require("../models/Incident");
const Contact = require("../models/Contact"); // NEW
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ msg: "Access denied. Admin only." });
  }
};

// Apply auth and admin middleware to all routes in this file
router.use(authMiddleware, adminOnly);

// 1. Get system stats (for an attractive dashboard)
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDetections = await Detection.countDocuments();
    const totalIncidents = await Incident.countDocuments();
    const totalContacts = await Contact.countDocuments();

    // Get latest 5 incidents
    const recentIncidents = await Incident.find().sort({ createdAt: -1 }).limit(10).lean();

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDetections,
        totalIncidents,
        totalContacts
      },
      recentIncidents
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ msg: "Server error retrieving stats" });
  }
});

// 2. Get all users with DANGER detections, cameras status, and alert email telemetry
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();
    const cameras = await Camera.find().lean();
    const detections = await Detection.find().select("userId status email_status").lean();

    const usersWithTelemetry = users.map(user => {
      const userIdStr = user._id.toString();

      // User's cameras
      const userCams = cameras.filter(c => c.userId && c.userId.toString() === userIdStr);
      const activeCams = userCams.filter(c => c.status === "Online");

      // User's detections
      const userDetections = detections.filter(d => d.userId && d.userId.toString() === userIdStr);
      const dangerDetections = userDetections.filter(d => d.status === "DANGER" || d.status === "DANGER ZONE BREACH");
      const emailSent = userDetections.filter(d => d.email_status === "sent");
      const emailFailed = userDetections.filter(d => d.email_status === "failed");

      return {
        ...user,
        camerasCount: userCams.length,
        activeCamerasCount: activeCams.length,
        dangerCount: dangerDetections.length,
        totalDetections: userDetections.length,
        emailAlertsSent: emailSent.length,
        emailAlertsFailed: emailFailed.length
      };
    });

    res.json({ success: true, users: usersWithTelemetry });
  } catch (error) {
    console.error("Admin get users error:", error);
    res.status(500).json({ msg: "Server error retrieving users" });
  }
});

// 2.5 Get contact messages
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (error) {
    console.error("Admin get contacts error:", error);
    res.status(500).json({ msg: "Server error retrieving contacts" });
  }
});

// 2.8 Get recent incident logs for stream panel
router.get("/incidents", async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ createdAt: -1 }).limit(25).lean();
    res.json({ success: true, incidents });
  } catch (error) {
    console.error("Admin get incidents error:", error);
    res.status(500).json({ msg: "Server error retrieving incidents" });
  }
});

// 3. Update user role
router.put("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "operator", "viewer"].includes(role)) {
      return res.status(400).json({ msg: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Admin update role error:", error);
    res.status(500).json({ msg: "Server error updating role" });
  }
});

// 4. Delete user
router.delete("/users/:id", async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.user.id === req.params.id) {
      return res.status(400).json({ msg: "You cannot delete your own admin account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({ success: true, msg: "User deleted successfully" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ msg: "Server error deleting user" });
  }
});

const os = require("os");

// CPU Sampler for real-time diagnostics
function getCPUUsage() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return { idle: 0, total: 0 };
  let totalIdle = 0;
  let totalTick = 0;
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
}

let lastCpuStats = getCPUUsage();
let currentCpuUsage = 15;

setInterval(() => {
  const start = lastCpuStats;
  const end = getCPUUsage();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  if (totalDiff > 0) {
    currentCpuUsage = Math.round(100 - (100 * idleDiff / totalDiff));
  }
  lastCpuStats = end;
}, 2000);

// Get real-time system diagnostics telemetry
router.get("/diagnostics", async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramUsagePercent = Math.round((usedMem / totalMem) * 100);

    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : "Standard Core Sentinel";

    // Proportional temperature simulation based on real CPU usage
    const temp = Math.max(38, Math.min(85, 42 + Math.round(currentCpuUsage * 0.35) + Math.floor(Math.random() * 4)));

    res.json({
      success: true,
      cpu: currentCpuUsage,
      ram: ramUsagePercent,
      temp: temp,
      systemInfo: {
        platform: os.platform(),
        cpuModel: cpuModel,
        uptime: os.uptime()
      }
    });
  } catch (error) {
    console.error("Admin diagnostics error:", error);
    res.status(500).json({ msg: "Server error retrieving diagnostics" });
  }
});

module.exports = router;
