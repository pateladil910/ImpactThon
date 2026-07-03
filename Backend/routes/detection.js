const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");
const sendAlertEmail = require("../utils/sendEmail");

// flag to avoid multiple mails
let mailSent = false;

// AI / Detection API
router.post("/", async (req, res) => {
  try {
    const { danger, confidence, userId, image, cameraName, factory, breachType, severity } = req.body;

    // 🔥 EMAIL & INCIDENT LOGIC
    if (danger === true) {
      // 1. Save to Detection History
      try {
        const mongoose = require("mongoose");
        await Detection.create({
          status: "DANGER",
          message: breachType === "NO_HELMET" ? "Helmet Violation detected" :
                   breachType === "NO_VEST" ? "Safety Vest Violation detected" :
                   "Human proximity breach",
          event: "Human detected inside danger zone",
          timestamp: new Date(),
          timestamp_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          photo_base64: image || "",
          email_status: "sent",
          userId: mongoose.Types.ObjectId.isValid(userId) ? userId : null
        });
        console.log("💾 Danger stored to Detection History");
      } catch (dbError) {
        console.error("❌ DB Save Error:", dbError);
      }

      // 2. Save to Incident Log
      try {
        const Incident = require("../models/Incident");
        await Incident.create({
          userId: userId && userId !== "system" ? userId : null,
          type: breachType === "NO_HELMET" ? "PPE: Helmet Violation" :
                breachType === "NO_VEST" ? "PPE: Safety Vest Violation" :
                breachType === "ZONE_INTRUSION" ? "Restricted Zone Proximity Breach" :
                "Human Proximity Intrusion",
          breachType: breachType || "PROXIMITY",
          confidence: confidence || 100,
          camera: cameraName || "Optical Node",
          factory: factory || "Factory A",
          severity: severity || "DANGER",
          snapshotUrl: image || ""
        });
        console.log("💾 Incident logged to DB");
      } catch (incError) {
        console.error("❌ Incident Save Error:", incError);
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
