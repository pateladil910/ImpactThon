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

    // Get latest 5 incidents
    const recentIncidents = await Incident.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDetections,
        totalIncidents
      },
      recentIncidents
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ msg: "Server error retrieving stats" });
  }
});

// 2. Get all users with detection counts
router.get("/users", async (req, res) => {
  try {
    const users = await User.aggregate([
      {
        $lookup: {
          from: "history", // Detection collection
          localField: "email",
          foreignField: "userId",
          as: "userDetections"
        }
      },
      {
        $addFields: {
          detectionCount: { $size: "$userDetections" }
        }
      },
      {
        $project: {
          password: 0,
          userDetections: 0 // Hide the raw array
        }
      }
    ]);
    res.json({ success: true, users });
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

module.exports = router;
