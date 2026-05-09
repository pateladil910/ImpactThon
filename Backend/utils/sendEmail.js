const { Resend } = require("resend");
const resend = new Resend('re_5Y834Z7x_UAwoJVHEWhyJPJjxWKcnUtGr');

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User", imageBase64 = null, recipientEmail = null) => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);

  // Create image HTML if an image was provided (UNTOUCHED)
  const imageHtml = imageBase64
    ? `<div style="margin-top: 20px; text-align: center;">
         <img src="${imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`}" 
              alt="Detection Snapshot" 
              style="max-width: 100%; border-radius: 5px; border: 2px solid #d9534f;" />
       </div>`
    : '';

  try {
    const { data, error } = await resend.emails.send({
      // Resend free tier requires the From address to be onboarding@resend.dev
      from: 'AI Safety System <notifications@codevortex.in>',
      replyTo: userEmail,
      to: recipientEmail || process.env.ADMIN_EMAIL || "codevortex131594@gmail.com",
      subject: "🚨 Danger Alert Detected",
      html: `
        <div style="font-family: sans-serif; padding: 20px; background: #f4f4f4; border-radius: 8px; max-width: 600px; margin: auto;">
          <h2 style="color: #d9534f; border-bottom: 2px solid #d9534f; padding-bottom: 10px;">Security Notification</h2>
          <p><strong>Reported By:</strong> ${userName} (${userEmail})</p>
          <p><strong>Alert Message:</strong></p>
          <p style="background: white; padding: 15px; border-left: 4px solid #d9534f; font-size: 16px;">${message}</p>
          ${imageHtml}
        </div>`
    });

    if (error) {
      console.error("❌ RESEND API ERROR:", error);
      throw new Error(error.message);
    }

    console.log("✅ Mail response ID:", data.id);
    return true;
  } catch (error) {
    console.error("❌ GMAIL ALERT ERROR:", error.message);
    throw new Error(error.message);
  }
};

module.exports = sendAlertEmail;