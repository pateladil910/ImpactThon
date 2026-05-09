const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: 'smtp-prod.mailrcld.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'adilp4534@gmail.com',
    pass: '6ddbb671738858bb3e89bae40fac1cdc'
  }
});

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User", imageBase64 = null) => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);

  // Create image HTML if an image was provided
  const imageHtml = imageBase64
    ? `<div style="margin-top: 20px; text-align: center;">
         <img src="${imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`}" 
              alt="Detection Snapshot" 
              style="max-width: 100%; border-radius: 5px; border: 2px solid #d9534f;" />
       </div>`
    : '';

  const mailOptions = {
    from: `"AI Safety System" <adilp4534@gmail.com>`, // Must be an authenticated sender in Mailercloud
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
    console.error("❌ API MAIL ERROR:", error.message);
    throw new Error(error.message);
  }
};

module.exports = sendAlertEmail;