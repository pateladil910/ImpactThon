const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const Contact = require("../models/Contact");

const transporter = nodemailer.createTransport({
  host: 'smtp-prod.mailrcld.com',
  port: 2525,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'adilp4534@gmail.com',
    pass: process.env.SMTP_PASS || '6ddbb671738858bb3e89bae40fac1cdc'
  },
  connectionTimeout: 20000, // 20 seconds timeout
  greetingTimeout: 10000,
  socketTimeout: 15000
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

    // 2. Send Email via Mailcloud SMTP
    const mailOptions = {
      from: `"CodeVortex Contact Form" <info@codevortex.in>`, // Must be authenticated sender
      replyTo: email,
      to: "codevortex131594@gmail.com", // Hardcoded per user request
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

    try {
      // Attempt to send the email
      await transporter.sendMail(mailOptions);
      console.log("✅ Contact email sent successfully");

      // Stop here and tell the frontend it worked
      return res.status(200).json({
        success: true,
        msg: "Message sent successfully!"
      });

    } catch (mailError) {
      console.error("❌ SMTP Error:", mailError.message);

      // We still return 200 because the data IS saved in MongoDB for the Admin,
      // but we warn the user that the email notification had a hiccup.
      return res.status(200).json({
        success: true,
        msg: "Message saved to Admin Panel (Email notification delayed)."
      });
    }

  } catch (error) {
    // This catches errors from the Database save (Contact.create)
    console.error("❌ Contact Route Database Error:", error);
    return res.status(500).json({
      success: false,
      msg: "Server error: Could not save message."
    });
  }
});

module.exports = router;
