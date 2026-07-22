const { Resend } = require("resend");

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY || "re_fallback_key";
  return new Resend(apiKey);
};

const sendAlertEmail = async (message, userEmail = "no-reply@yourdomain.com", userName = "System User", imageBase64 = null, recipientEmail = null) => {
  console.log(`📧 sendAlertEmail triggering for: ${userName}`);
  const resend = getResendClient();

  const attachments = [];
  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    attachments.push({
      filename: "danger_snapshot.jpg",
      content: cleanBase64,
      content_id: "danger_snapshot_cid",
      content_type: "image/jpeg"
    });
  }

  const imageHtml = imageBase64
    ? `<div style="margin: 20px 0; text-align: center; background: #020617; padding: 15px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4);">
         <div style="color: #ef4444; font-size: 12px; font-family: sans-serif; font-weight: bold; letter-spacing: 1px; margin-bottom: 10px; text-transform: uppercase;">📷 Live Intrusion Snapshot Captured</div>
         <img src="cid:danger_snapshot_cid" 
               alt="Detection Snapshot" 
               style="max-width: 100%; border-radius: 6px; border: 2px solid #ef4444; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);" />
         <p style="color: #94a3b8; font-size: 11px; margin-top: 8px;">(High-resolution photo snapshot is attached to this alert)</p>
       </div>`
    : '';

  try {
    const { data, error } = await resend.emails.send({
      from: 'AI Safety System <notifications@codevortex.in>',
      replyTo: userEmail,
      to: recipientEmail || process.env.ADMIN_EMAIL || "adilp4534@gmail.com",
      subject: "🚨 CRITICAL ALERT: Danger Zone Proximity Breach Detected",
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; background: #020617; color: #f8fafc; border-radius: 12px; max-width: 620px; margin: auto; border: 1px solid #1e293b; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
          
          <div style="border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="color: #06b6d4; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: 1px;">CODE VORTEX</h1>
            <div style="color: #ef4444; font-size: 11px; font-weight: 700; letter-spacing: 2px; margin-top: 3px;">INDUSTRIAL AI SAFETY SHIELD</div>
          </div>

          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; font-size: 13px; font-weight: 800; padding: 10px 16px; border-radius: 8px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; text-align: center;">
            🚨 CRITICAL DANGER BREACH DETECTED
          </div>

          <div style="background: #0f172a; border-radius: 10px; padding: 20px; border: 1px solid #1e293b; margin-bottom: 20px;">
            <h3 style="color: #f8fafc; margin-top: 0; font-size: 15px; border-bottom: 1px solid #334155; padding-bottom: 10px;">Threat Incident Summary</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #cbd5e1;">
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">Operator Account:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #06b6d4; text-align: right;">${userName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">Sensor Node:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #f8fafc; text-align: right;">Local Edge Camera CH1</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">AI Detection Engine:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #10b981; text-align: right;">YOLOv8 Active</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">Machine Action:</td>
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444; text-align: right;">EMERGENCY TRIP ACTIVATED</td>
              </tr>
            </table>
          </div>

          <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; font-size: 14px; color: #fca5a5; line-height: 1.5; margin-bottom: 20px;">
            <strong>Alert Details:</strong><br/>
            ${message}
          </div>

          ${imageHtml}

          <div style="text-align: center; margin-top: 25px;">
            <a href="https://codevortex.in/pages/dashboard.html" style="background: #06b6d4; color: #020617; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 25px; font-size: 14px; display: inline-block; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4);">Open Live Dashboard →</a>
          </div>

          <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 15px; text-align: center; color: #64748b; font-size: 12px;">
            Automated Security Dispatch • Code Vortex Safety Cloud • Industrial Safety Compliance
          </div>
        </div>`,
      attachments: attachments
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
  const resend = getResendClient();
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