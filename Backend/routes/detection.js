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
          let matchedCam = null;

          for (const cam of allCameras) {
            if (normalizeUrl(cam.url) === normalizedInput) {
              matchedCam = cam;
              break;
            }
          }

          if (!matchedCam && normalizedInput) {
            for (const cam of allCameras) {
              const normalizedCamUrl = normalizeUrl(cam.url);
              if (normalizedCamUrl && (normalizedInput.includes(normalizedCamUrl) || normalizedCamUrl.includes(normalizedInput))) {
                matchedCam = cam;
                break;
              }
            }
          }

          if (matchedCam && matchedCam.userId) {
            resolvedUserId = matchedCam.userId;
            console.log(`[DETECTION] Camera matched by stream URL → userId: ${resolvedUserId}`);

            const User = require("../models/User");
            const userDoc = await User.findById(resolvedUserId);
            if (userDoc) {
              targetEmail = userDoc.email;
              targetName  = userDoc.name || userDoc.email;
              console.log(`[DETECTION] Camera owner resolved → ${targetEmail}`);
            }
          } else {
            console.log(`[DETECTION] No Camera record matched stream URL: ${cameraStreamUrl}`);
          }
        } catch (lookupErr) {
          console.error("[DETECTION] Camera/User lookup error:", lookupErr.message);
        }
      }

      // Use recipient_email from AI payload as fallback when no DB match
      const emailTarget = targetEmail || recipient_email || null;

      // Fallback: If camera owner lookup failed, try to resolve userId by recipient_email
      if (!resolvedUserId && emailTarget) {
        try {
          const User = require("../models/User");
          const userDoc = await User.findOne({ email: emailTarget });
          if (userDoc) {
            resolvedUserId = userDoc._id;
            console.log(`[DETECTION] Resolved userId by recipient_email fallback → userId: ${resolvedUserId}`);
          }
        } catch (err) {
          console.error("[DETECTION] Failed to resolve userId by email fallback:", err.message);
        }
      }

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
