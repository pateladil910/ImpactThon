const express = require("express");
const router = express.Router();
const axios = require("axios");
const Contact = require("../models/Contact");

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

    // 2. Send Email via Mailcloud API
    const options = {
      method: 'POST',
      url: 'https://api.mailercloud.com/v1/send/mail',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.MAILER_API_KEY
      },
      data: {
        "from": process.env.EMAIL_USER || "no-reply@codevortex.in",
        "from_name": "CodeVortex Contact Form",
        "reply_to": email,
        "to": "codevortex131594@gmail.com", // Hardcoded per user request
        "subject": `New Contact Message from ${name}`,
        "content": `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background: #f4f4f4; border-radius: 8px;">
            <h2 style="color: #08343D;">New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <hr style="border: 1px solid #ccc;">
            <p><strong>Message:</strong></p>
            <p style="background: white; padding: 15px; border-radius: 5px;">${message}</p>
          </div>
        `,
        "type": "html"
      }
    };

    try {
      await axios.request(options);
      console.log("✅ Contact email sent successfully via Mailcloud");
    } catch (mailError) {
      // Log but do not fail the request completely if mail fails, because DB save succeeded
      console.error("❌ Mailcloud Error in Contact Route:", mailError.response ? mailError.response.data : mailError.message);
    }

    res.status(200).json({ success: true, msg: "Message sent successfully" });

  } catch (error) {
    console.error("❌ Contact Route Error:", error);
    res.status(500).json({ success: false, msg: "Server error while sending message" });
  }
});

module.exports = router;
