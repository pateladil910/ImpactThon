// const express = require("express");
// const router = express.Router();
// const sendMail = require("../utils/mailer");

// let lastSent = 0;

// router.post("/danger", async (req, res) => {
//   const now = Date.now();

//   // prevent spamming (1 mail per 30 sec)
//   if (now - lastSent < 30000) {
//     return res.json({ status: "skipped" });
//   }

//   try {
//     await sendMail();
//     lastSent = now;
//     console.log("🚨 DANGER MAIL SENT");
//     res.json({ status: "mail sent" });
//   } catch (err) {
//     console.error("❌ Mail error:", err);
//     res.status(500).json({ error: "mail failed" });
//   }
// });

// module.exports = router;
