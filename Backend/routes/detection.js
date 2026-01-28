const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");

// Get last detection
router.get("/last", async (req, res) => {
  try {
    const last = await Detection.findOne().sort({ createdAt: -1 });
    res.json(last);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
