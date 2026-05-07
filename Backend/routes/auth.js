const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// REGISTER
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 1. Check if user already exists BEFORE trying to save
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Send 400 (Bad Request) instead of crashing with 500
      return res.status(400).json({ message: "This email is already registered. Please login." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: role || "viewer"
    });

    await user.save();
    
    // 2. Success response
    return res.status(201).json({ message: "User registered successfully" });

  } catch (error) {
    console.error("Signup Error:", error);
    // 3. Only send 500 if it's a real server crash (like database is down)
    res.status(500).json({ message: "Server error. Please try again later." });
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
