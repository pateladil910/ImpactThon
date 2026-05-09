const nodemailer = require("nodemailer");

// ONLY CHANGE: Switched to Gmail service and using Environment Variables
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  family: 4 // This forces IPv4 and fixes the ENETUNREACH error
});

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User", imageBase64 = null) => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);

  // Create image HTML if an image was provided (UNTOUCHED)
  const imageHtml = imageBase64
    ? `<div style="margin-top: 20px; text-align: center;">
         <img src="${imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`}" 
              alt="Detection Snapshot" 
              style="max-width: 100%; border-radius: 5px; border: 2px solid #d9534f;" />
       </div>`
    : '';

  const mailOptions = {
    // ONLY CHANGE: "from" must match the authenticated Gmail user
    from: `"AI Safety System" <${process.env.SMTP_USER}>`,
    replyTo: userEmail,
    to: process.env.ADMIN_EMAIL || "codevortex131594@gmail.com",
    subject: "🚨 Danger Alert Detected",
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #f4f4f4; border-radius: 8px; max-width: 600px; margin: auto;">
        <h2 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 10px;">Security Notification</h2>
        <p><strong>Reported By:</strong> ${userName} (${userEmail})</p>
        <p><strong>Alert Message:</strong></p>
        <p style="background: white; padding: 15px; border-left: 4px solid #d9534f; font-size: 16px;">${message}</p>
        ${imageHtml}
      </div>`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Mail response:", info.messageId);
    return true;
  } catch (error) {
    // ONLY CHANGE: Log label changed to GMAIL for clarity
    console.error("❌ GMAIL ALERT ERROR:", error.message);
    throw new Error(error.message);
  }
};

module.exports = sendAlertEmail;