const express = require("express");
const router = express.Router();
const sendAlertEmail = require("../utils/sendEmail");

// flag to avoid multiple mails
let mailSent = false;

// AI / Detection API
router.post("/", async (req, res) => {
  try {
    const { danger, confidence } = req.body;
    // example: danger = true when human detected

    // 🔥 EMAIL TRIGGER LOGIC
    if (danger === true && !mailSent) {
      await sendAlertEmail(
        `🚨 ALERT: Human detected near machine!\nConfidence: ${confidence}%`
      );
      mailSent = true;
      console.log("📧 Alert email sent");
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
