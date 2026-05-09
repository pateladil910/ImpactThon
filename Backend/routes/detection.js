const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");
const sendAlertEmail = require("../utils/sendEmail");

// flag to avoid multiple mails
let mailSent = false;

// AI / Detection API
router.post("/", async (req, res) => {
  try {
    const { danger, confidence, userId, image } = req.body; // NEW: receive userId and image
    // example: danger = true when human detected

    // 🔥 EMAIL TRIGGER LOGIC
    if (danger === true) {
      // Save to Database
      try {
        await Detection.create({
          status: "DANGER",
          message: "Human detected",
          timestamp: new Date(),
          timestamp_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          userId: userId || "system" // Track which user made detection
        });
        console.log("💾 Danger stored to DB");
      } catch (dbError) {
        console.error("❌ DB Save Error:", dbError);
      }

      if (!mailSent) {
        await sendAlertEmail(
          `🚨 ALERT: Human detected near machine!\nConfidence: ${confidence}%`,
          "system@codevortex.in",
          userId || "System Detection",
          image // Pass the optional base64 image
        );
        mailSent = true;
        console.log("📧 Alert email sent with image");
      }
    }

    // reset when danger clears
    if (danger === false) {
      mailSent = false;
    }

    res.status(200).json({
      success: true,
      message: "Detection data received",
      danger,
      confidence,
    });
  } catch (error) {
    console.error("Detection error:", error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
