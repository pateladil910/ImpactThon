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
        // Fetch User to get their email
        let targetEmail = null;
        let targetName = userId || "System Detection";
        
        try {
          if (userId && userId !== "system") {
            const User = require("../models/User");
            const userDoc = await User.findById(userId);
            if (userDoc) {
              targetEmail = userDoc.email;
              targetName = userDoc.name || targetName;
            }
          }
        } catch (err) {
          console.error("❌ Could not fetch user email for alert:", err.message);
        }

        await sendAlertEmail(
          `🚨 ALERT: Human detected near machine!\nConfidence: ${confidence}%`,
          "system@codevortex.in",
          targetName,
          image, // Pass the optional base64 image
          targetEmail // Send to the specific user if found
        );
        mailSent = true;
        console.log(`📧 Alert email sent to ${targetEmail || "Admin"}`);
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
