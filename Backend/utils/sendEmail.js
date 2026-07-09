const { Resend } = require("resend");

const apiKey = process.env.RESEND_API_KEY || 're_5Y834Z7x_UAwoJVHEWhyJPJjxWKcnUtGr';
const resend = new Resend(apiKey);

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User", imageBase64 = null, recipientEmail = null) => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);

  // Create image HTML if an image was provided
  const imageHtml = imageBase64
    ? `<div style="margin-top: 20px; text-align: center;">
         <img src="${imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`}" 
               alt="Detection Snapshot" 
               style="max-width: 100%; border-radius: 5px; border: 2px solid #d9534f;" />
       </div>`
    : '';

  try {
    const { data, error } = await resend.emails.send({
      from: 'AI Safety System <notifications@codevortex.in>',
      replyTo: userEmail,
      to: recipientEmail || process.env.ADMIN_EMAIL || "adilp4534@gmail.com",
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

const sendResetPasswordEmail = async (recipientEmail, code) => {
  console.log(`📧 Sending Reset Password Email to: ${recipientEmail}`);
  try {
    const { data, error } = await resend.emails.send({
      from: 'AI Safety System <notifications@codevortex.in>',
      to: recipientEmail,
      subject: "🔒 Password Reset Verification Code",
      html: `
        <div style="font-family: sans-serif; padding: 25px; background: #0f172a; color: #f8fafc; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #1e293b;">
          <h2 style="color: #06b6d4; border-bottom: 1px solid #1e293b; padding-bottom: 15px; text-align: center; margin-top: 0;">AI Smart Safety System</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">You requested a password reset for your AI Smart Safety System account. Use the following verification code to proceed:</p>
          <div style="background: #1e293b; padding: 15px; text-align: center; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #06b6d4; margin: 25px 0;">
            ${code}
          </div>
          <p style="font-size: 14px; color: #94a3b8; text-align: center; margin-bottom: 0;">This code is valid for 15 minutes. If you did not request this reset, please ignore this email.</p>
        </div>`
    });

    if (error) {
      console.error("❌ RESEND API RESET ERROR:", error);
      throw new Error(error.message);
    }

    console.log("✅ Reset Mail sent response ID:", data.id);
    return true;
  } catch (error) {
    console.error("❌ RESET MAIL ERROR:", error.message);
    throw new Error(error.message);
  }
};

sendAlertEmail.sendResetPasswordEmail = sendResetPasswordEmail;
module.exports = sendAlertEmail;