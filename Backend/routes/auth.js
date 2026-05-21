const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const sendAlertEmail = require("../utils/sendEmail");

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

// FORGOT PASSWORD (OTP generation & Dispatch)
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, msg: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, msg: "User with this email not found" });
    }

    // Generate random 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Save code and expiry (15 mins) to user doc
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // Send the reset code via email
    await sendAlertEmail.sendResetPasswordEmail(user.email, code);

    res.json({ success: true, msg: "Verification code sent to your email" });
  } catch (error) {
    console.error("Forgot password API error:", error);
    res.status(500).json({ success: false, msg: "Server error. Please try again later." });
  }
});

// RESET PASSWORD (Verification & Storage)
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, msg: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, msg: "User with this email not found" });
    }

    // Verify OTP is present and valid
    if (!user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ success: false, msg: "Invalid verification code" });
    }

    // Verify OTP has not expired
    if (new Date() > user.resetCodeExpires) {
      return res.status(400).json({ success: false, msg: "Verification code has expired" });
    }

    // Hash the new password securely
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP fields in database
    user.password = hashedPassword;
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    res.json({ success: true, msg: "Password updated successfully! Please login." });
  } catch (error) {
    console.error("Reset password API error:", error);
    res.status(500).json({ success: false, msg: "Server error. Please try again later." });
  }
});

module.exports = router;
