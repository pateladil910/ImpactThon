const axios = require("axios");

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
        <div style="font-family: sans-serif; padding: 20px; background: #f4f4f4; border-radius: 8px; max-width: 600px; margin: auto;">
          <h2 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 10px;">Security Notification</h2>
          <p><strong>Reported By:</strong> ${userName} (${userEmail})</p>
          <p><strong>Alert Message:</strong></p>
          <p style="background: white; padding: 15px; border-left: 4px solid #d9534f; font-size: 16px;">${message}</p>
          ${imageHtml}
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