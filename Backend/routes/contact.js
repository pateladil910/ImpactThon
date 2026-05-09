const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const Contact = require("../models/Contact");

const transporter = nodemailer.createTransport({
  host: 'smtp-prod.mailrcld.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'adilp4534@gmail.com',
    pass: '6ddbb671738858bb3e89bae40fac1cdc'
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

    // 2. Send Email via Mailcloud SMTP
    const mailOptions = {
      from: `"CodeVortex Contact Form" <adilp4534@gmail.com>`, // Must be authenticated sender
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
      await transporter.sendMail(mailOptions);
      console.log("✅ Contact email sent successfully via Mailcloud SMTP");
    } catch (mailError) {
      // Log but do not fail the request completely if mail fails, because DB save succeeded
      console.error("❌ Mailcloud Error in Contact Route:", mailError.message);
    }

    res.status(200).json({ success: true, msg: "Message sent successfully" });

  } catch (error) {
    console.error("❌ Contact Route Error:", error);
    res.status(500).json({ success: false, msg: "Server error while sending message" });
  }
});

module.exports = router;
