const axios = require("axios");

// We set default values so it doesn't break if called with only one argument
const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User") => {
  console.log(`📧 sendAlertEmail triggered for: ${userName}`);

  const options = {
    method: 'POST',
    url: 'https://api.mailercloud.com/v1/transactional/send',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.MAILER_API_KEY 
    },
    data: {
      "from": process.env.EMAIL_USER, // Your verified Mailercloud email
      "from_name": userName,           // Fallback to "System User" if not provided
      "reply_to": userEmail,          // Fallback to your domain email if not provided
      "to": process.env.ADMIN_EMAIL,
      "subject": "🚨 Danger Alert Detected",
      "content": `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #d9534f;">Security Notification</h2>
          <p><strong>Reported By:</strong> ${userName} (${userEmail})</p>
          <hr>
          <p><strong>Alert Message:</strong></p>
          <p style="background: #f9f9f9; padding: 10px;">${message}</p>
        </div>`,
      "type": "html"
    }
  };

  try {
    const response = await axios.request(options);
    console.log("✅ Mail response:", response.data);
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error("❌ API MAIL ERROR:", errorMsg);
    // We don't want to crash the whole server if the mail fails
  }
};

module.exports = sendAlertEmail;