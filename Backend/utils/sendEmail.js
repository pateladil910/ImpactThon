const axios = require("axios");

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User") => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);

  const options = {
    method: 'POST',
    // FIXED URL: The correct endpoint for Mailercloud v1
    url: 'https://api.mailercloud.com/v1/send/mail', 
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.MAILER_API_KEY 
    },
    data: {
      "from": process.env.EMAIL_USER, 
      "from_name": userName,           
      "reply_to": userEmail,          
      "to": process.env.ADMIN_EMAIL,
      "subject": "🚨 Danger Alert Detected",
      "content": `
        <div style="font-family: sans-serif; padding: 20px;">
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
    // Detailed error logging to see exactly why it failed
    if (error.response) {
      console.error("❌ API MAIL ERROR:", error.response.status, error.response.data);
    } else {
      console.error("❌ API MAIL ERROR:", error.message);
    }
  }
};

module.exports = sendAlertEmail;