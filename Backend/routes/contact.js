const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const Contact = require("../models/Contact");

// Reuse working Gmail credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'adilp4534@gmail.com',
    pass: 'fpdkyriibohtspan'
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, msg: "Please fill all fields" });
    }

    // 1. Save to Database for Admin Panel
    const newContact = await Contact.create({
      name,
      email,
      message
    });

    // 2. Send Email via Gmail SMTP
    try {
      const mailOptions = {
        from: `"CodeVortex System" <adilp4534@gmail.com>`,
        replyTo: email,
        to: "codevortex131594@gmail.com",
        subject: `New Contact Message from ${name}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background: #f4f4f4; border-radius: 8px;">
            <h2 style="color: #08343D;">New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <hr style="border: 1px solid #ccc;">
            <p><strong>Message:</strong></p>
            <p style="background: white; padding: 15px; border-radius: 5px;">${message}</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log("✅ Contact email sent successfully");

      return res.status(200).json({
        success: true,
        msg: "Message sent successfully!"
      });

    } catch (mailError) {
      console.error("❌ Email Sending Error:", mailError.message);

      // Return 200 because DB save worked, but warn about email delay
      return res.status(200).json({
        success: true,
        msg: "Message saved to Admin Panel (Email notification delayed)."
      });
    }

  } catch (error) {
    console.error("❌ Contact Route Database Error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server error: Could not save message."
    });
  }
});

module.exports = router;