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
      cameraStreamUrl,
      cameraName,
      factory,
      breachType,
      severity,
      userId,
      recipient_email
    } = req.body;

    if (danger === true) {
      // 1. Resolve camera owner via userId or stream URL
      let resolvedUserId = userId || null;
      let targetEmail    = recipient_email || null;
      let targetName     = "System Detection";

      const User = require("../models/User");
      const Camera = require("../models/Camera");

      // Try resolving via cameraStreamUrl if provided
      if (cameraStreamUrl) {
        try {
          const allCameras = await Camera.find({});
          const normalizeUrl = (u) => {
            if (!u) return "";
            let clean = u.toLowerCase().trim();
            clean = clean.replace(/^(rtsp|rtmp|http|https):\/\//, "");
            if (clean.includes("@")) {
              clean = clean.substring(clean.lastIndexOf("@") + 1);
            }
            if (clean.endsWith("/")) {
              clean = clean.slice(0, -1);
            }
            return clean;
          };

          const normalizedInput = normalizeUrl(cameraStreamUrl);
          let matchedCam = allCameras.find(c => normalizeUrl(c.url) === normalizedInput);
          if (!matchedCam && normalizedInput) {
            matchedCam = allCameras.find(c => {
              const nu = normalizeUrl(c.url);
              return nu && (normalizedInput.includes(nu) || nu.includes(normalizedInput));
            });
          }

          if (matchedCam && matchedCam.userId) {
            resolvedUserId = matchedCam.userId;
            console.log(`[DETECTION] Camera matched by stream URL → userId: ${resolvedUserId}`);
          }
        } catch (lookupErr) {
          console.error("[DETECTION] Camera lookup error:", lookupErr.message);
        }
      }

      // If we have resolvedUserId, fetch owner's email
      if (resolvedUserId) {
        try {
          const userDoc = await User.findById(resolvedUserId);
          if (userDoc) {
            targetEmail = userDoc.email;
            targetName  = userDoc.name || userDoc.email;
            console.log(`[DETECTION] Camera owner resolved → ${targetEmail}`);
          }
        } catch (uErr) {
          console.error("[DETECTION] User lookup error:", uErr.message);
        }
      }

      const emailTarget = targetEmail || recipient_email || process.env.ADMIN_EMAIL || "adilp4534@gmail.com";

      // 2. Save to Detection History (scoped to owner)
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
          userId:        resolvedUserId
        });
        console.log(`[DETECTION] Danger saved to history | userId: ${resolvedUserId}`);
      } catch (dbError) {
        console.error("[DETECTION] DB Save Error:", dbError);
      }

      // 3. Save to Incident Log
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

      // 4. Send alert email with photo snapshot attached
      if (emailTarget) {
        try {
          await sendAlertEmail(
            `🚨 ALERT: Human detected inside Danger Zone!\nConfidence: ${confidence}%\nCamera: ${cameraName || "CH1"}`,
            "system@codevortex.in",
            targetName,
            image,
            emailTarget
          );
          console.log(`[DETECTION] Alert email with photo sent to ${emailTarget}`);
        } catch (mailErr) {
          console.error("[DETECTION] Failed to send alert email:", mailErr.message);
        }
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
