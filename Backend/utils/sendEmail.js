const nodemailer = require("nodemailer");

const sendAlertEmail = async (message) => {
  console.log("📧 sendAlertEmail triggered");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"AI Safety System" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: "🚨 Danger Alert Detected",
    text: message,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ Mail response:", info.response);
};

module.exports = sendAlertEmail;
