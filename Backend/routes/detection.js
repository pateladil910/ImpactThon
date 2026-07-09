const express = require("express");
const router = express.Router();
const Detection = require("../models/Detection");
const sendAlertEmail = require("../utils/sendEmail");

// AI / Detection API
router.post("/", async (req, res) => {
  try {
    const {
      danger,
      confidence,
      image,
      cameraStreamUrl, // stable RTSP/HTTP URL — primary owner lookup key
      cameraName,      // display name only (fallback label)
      factory,
      breachType,
      severity,
      recipient_email  // fallback when no Camera record matches
    } = req.body;

    if (danger === true) {
      // ─────────────────────────────────────────────────
      // 1. Resolve camera owner via stable stream URL
      // ─────────────────────────────────────────────────
      let resolvedUserId = null;
      let targetEmail    = null;
      let targetName     = "System Detection";

      if (cameraStreamUrl) {
        try {
          const Camera = require("../models/Camera");
          const cam = await Camera.findOne({ url: cameraStreamUrl });
          if (cam && cam.userId) {
            resolvedUserId = cam.userId;
            console.log(`[DETECTION] Camera matched by URL → userId: ${resolvedUserId}`);

            const User = require("../models/User");
            const userDoc = await User.findById(resolvedUserId);
            if (userDoc) {
              targetEmail = userDoc.email;
              targetName  = userDoc.name || userDoc.email;
              console.log(`[DETECTION] Camera owner resolved → ${targetEmail}`);
            }
          } else {
            console.log(`[DETECTION] No Camera record matched URL: ${cameraStreamUrl}`);
          }
        } catch (lookupErr) {
          console.error("[DETECTION] Camera/User lookup error:", lookupErr.message);
        }
      }

      // Use recipient_email from AI payload as fallback when no DB match
      const emailTarget = targetEmail || recipient_email || null;

      // ─────────────────────────────────────────────────
      // 2. Save to Detection History (scoped to owner)
      // ─────────────────────────────────────────────────
      try {
        await Detection.create({
          status:        "DANGER",
          message:       breachType === "NO_HELMET" ? "Helmet Violation detected" :
                         breachType === "NO_VEST"   ? "Safety Vest Violation detected" :
                         "Human proximity breach",
          event:         "Human detected inside danger zone",
          timestamp:     new Date(),
          timestamp_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          photo_base64:  image || "",
          email_status:  emailTarget ? "sent" : "not_triggered",
          userId:        resolvedUserId  // null only if camera owner could not be resolved
        });
        console.log(`[DETECTION] Danger saved to history | userId: ${resolvedUserId}`);
      } catch (dbError) {
        console.error("[DETECTION] DB Save Error:", dbError);
      }

      // ─────────────────────────────────────────────────
      // 3. Save to Incident Log
      // ─────────────────────────────────────────────────
      try {
        const Incident = require("../models/Incident");
        await Incident.create({
          userId:      resolvedUserId,
          type:        breachType === "NO_HELMET"      ? "PPE: Helmet Violation" :
                       breachType === "NO_VEST"        ? "PPE: Safety Vest Violation" :
                       breachType === "ZONE_INTRUSION" ? "Restricted Zone Proximity Breach" :
                       "Human Proximity Intrusion",
          breachType:  breachType  || "PROXIMITY",
          confidence:  confidence  || 100,
          camera:      cameraName  || cameraStreamUrl || "Optical Node",
          factory:     factory     || "Factory A",
          severity:    severity    || "DANGER",
          snapshotUrl: image       || ""
        });
        console.log("[DETECTION] Incident logged to DB");
      } catch (incError) {
        console.error("[DETECTION] Incident Save Error:", incError.message);
      }

      // ─────────────────────────────────────────────────
      // 4. Send alert email to camera owner (or fallback)
      // ─────────────────────────────────────────────────
      if (emailTarget) {
        try {
          await sendAlertEmail(
            `🚨 ALERT: Human detected near machine!\nConfidence: ${confidence}%`,
            "system@codevortex.in",
            targetName,
            image,
            emailTarget
          );
          console.log(`[DETECTION] Alert email sent to ${emailTarget}`);
        } catch (mailErr) {
          console.error("[DETECTION] Failed to send alert email:", mailErr.message);
        }
      } else {
        console.log("[DETECTION] No email target resolved — alert email skipped");
      }
    }

    res.status(200).json({
      success:    true,
      message:    "Detection data received",
      danger,
      confidence,
    });
  } catch (error) {
    console.error("Detection error:", error.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
