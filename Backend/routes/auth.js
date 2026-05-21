const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// REGISTER
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Manually check if email exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // Send 400 (Client Error) instead of 500 (Server Crash)
      return res.status(400).json({ message: "Email is already registered. Please login." });
    }

    // 2. If no duplicate, proceed to hash and save
    const hashedPassword = await bcrypt.hash(password, 10);

    // Automatically assign 'admin' role to this specific email
    let role = "viewer";
    if (email === "admin@codevortex.in") {
      role = "admin";
    }

    const user = new User({ name, email, password: hashedPassword, role });
    await user.save();

    // 3. Send 201 (Created)
    return res.status(201).json({ message: "Account created successfully!" });

  } catch (error) {
    console.error("Signup Crash:", error);
    // Only happens if the database is actually disconnected
    if (!res.headersSent) {
      return res.status(500).json({ message: "Server error. Please try again later." });
    }
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ msg: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ msg: "Wrong password" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    "secretkey"
  );

  // --- CHANGE STARTS HERE ---

  // 1. Set the cookie so the server can "see" it on page loads
  res.cookie("token", token, {
    httpOnly: true,     // Security: JS cannot steal the token
    secure: true,       // Required for Render (HTTPS)
    sameSite: "None",   // Required for cross-site cookie transmission
    maxAge: 24 * 60 * 60 * 1000 // Expires in 1 day
  });

  // 2. Send the response back to the frontend
  return res.json({
    success: true,
    role: user.role
  });

  // --- CHANGE ENDS HERE ---
});

// GET CURRENT USER (/api/auth/me)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // req.user has the payload from the token (id, role)
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Auth /me error:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "None"
  });
  res.json({ success: true, message: "Logged out" });
});

module.exports = router;
