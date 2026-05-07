const express = require("express");
const router = express.Router();
const Incident = require("../models/Incident");

// ADD INCIDENT
router.post("/add", async (req, res) => {
  try {
    const { type, confidence, camera } = req.body;

    if (!type || !confidence || !camera) {
      return res.status(400).json({ error: "All fields required" });
    }

    const incident = new Incident({
      type,
      confidence,
      camera,
    });

    await incident.save();

    res.status(201).json({ message: "Incident saved" });
  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET ALL INCIDENTS
router.get("/all", async (req, res) => {
  const incidents = await Incident.find().sort({ createdAt: -1 });
  res.json(incidents);
});

module.exports = router;
