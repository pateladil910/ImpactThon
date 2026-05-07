const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
    const user = new User({ name, email, password: hashedPassword });
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

  res.json({ token, role: user.role });
});

module.exports = router;
