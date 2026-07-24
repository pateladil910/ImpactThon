const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Detection = require("../models/Detection");
const User = require("../models/User");
const Camera = require("../models/Camera");
const Incident = require("../models/Incident");
const sendAlertEmail = require("../utils/sendEmail");

async function resolveValidUser(userIdInput, cameraStreamUrl) {
  let targetUser = null;

  // 1. Try finding user by provided userId string if it's a valid ObjectId
  if (userIdInput && mongoose.Types.ObjectId.isValid(userIdInput)) {
    try {
      targetUser = await User.findById(userIdInput);
    } catch (e) { /* ignore */ }
  }

  // 2. Try resolving via cameraStreamUrl if not resolved yet
  if (!targetUser && cameraStreamUrl) {
    try {
      const allCameras = await Camera.find({});
      const normalizeUrl = (u) => {
        if (!u) return "";
        let clean = u.toLowerCase().trim();
        clean = clean.replace(/^(rtsp|rtmp|http|https):\/\//, "");
        if (clean.includes("@")) clean = clean.substring(clean.lastIndexOf("@") + 1);
        if (clean.endsWith("/")) clean = clean.slice(0, -1);
        return clean;
      };
      const inputNorm = normalizeUrl(cameraStreamUrl);
      let matchedCam = allCameras.find(c => normalizeUrl(c.url) === inputNorm);
      if (!matchedCam && inputNorm) {
        matchedCam = allCameras.find(c => {
          const nu = normalizeUrl(c.url);
          return nu && (inputNorm.includes(nu) || nu.includes(inputNorm));
        });
      }
      if (matchedCam && matchedCam.userId) {
        targetUser = await User.findById(matchedCam.userId);
      }
    } catch (e) { /* ignore */ }
  }

  // 3. Fallback: Return the first active user in the database so history/analytics are NEVER orphaned
  if (!targetUser) {
    try {
      targetUser = await User.findOne({}).sort({ createdAt: 1 });
    } catch (e) { /* ignore */ }
  }

  return targetUser;
}

// AI / Detection API
router.post("/", async (req, res) => {
  try {
    const {
      danger,
      warning,
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

    const userDoc = await resolveValidUser(userId, cameraStreamUrl);
    const resolvedUserId = userDoc ? userDoc._id : null;

    // ── Handle WARNING zone: log to history, NO email ──────────────────────
    if (warning === true && danger !== true) {
      try {
        await Detection.create({
          status:        "WARNING",
          message:       "Human detected in Warning Zone",
          event:         "Human approaching restricted area",
          timestamp:     new Date(),
          timestamp_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          photo_base64:  "",
          email_status:  "not_triggered",
          userId:        resolvedUserId
        });
        console.log(`[DETECTION] WARNING event saved to history | userId: ${resolvedUserId}`);
      } catch (dbErr) {
        console.error("[DETECTION] WARNING DB Save Error:", dbErr.message);
      }

      return res.status(200).json({ success: true, message: "Warning logged", warning: true });
    }

    if (danger === true) {
      const emailTarget = recipient_email || (userDoc ? userDoc.email : null) || process.env.ADMIN_EMAIL || "adilp4534@gmail.com";
      const targetName  = userDoc ? (userDoc.name || userDoc.email) : "System Detection";

      // 1. Save to Detection History (scoped to owner)
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
        console.error("[DETECTION] DB Save Error:", dbError.message);
      }

      // 2. Save to Incident Log
      try {
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

      // 3. Send alert email with photo snapshot attached (DANGER only)
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
