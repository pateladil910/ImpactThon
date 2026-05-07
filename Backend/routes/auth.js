const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// REGISTER
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // 1. Validate input exists
    if (!email || !password || !name) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 2. Check if email already exists to avoid the 11000 Mongo Error
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 3. Hash and Save
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email, 
      password: hashedPassword, 
      role: role || "viewer" 
    });

    await user.save();

    // 4. Send a clean success response
    res.status(201).json({ message: "User registered successfully" });

  } catch (error) {
    console.error("Signup Error Log:", error);
    // This sends the "Server error" message ONLY when a real crash happens
    res.status(500).json({ message: "Server error during registration" });
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
