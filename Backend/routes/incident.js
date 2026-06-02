const express = require("express");
const router = express.Router();
const Incident = require("../models/Incident");
const authMiddleware = require("../middleware/authMiddleware");

// ADD INCIDENT
router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { type, confidence, camera, breachType, factory, severity, snapshotUrl } = req.body;

    if (!type || !confidence || !camera) {
      return res.status(400).json({ error: "All fields required" });
    }

    const incident = new Incident({
      userId: req.user.id,
      type,
      confidence,
      camera,
      breachType: breachType || 'PROXIMITY',
      factory: factory || 'Factory A',
      severity: severity || 'DANGER',
      snapshotUrl: snapshotUrl || ''
    });

    await incident.save();

    res.status(201).json({ message: "Incident saved", incident });
  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET ALL INCIDENTS
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const incidents = await Incident.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(incidents);
  } catch (error) {
    console.error("Fetch Incidents Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
