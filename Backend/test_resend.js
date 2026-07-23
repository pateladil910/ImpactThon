const { Resend } = require("resend");

// Use the key defined in utils/sendEmail.js or process.env
const apiKey = process.env.RESEND_API_KEY || "";
console.log("Testing Resend API Key:", apiKey.substring(0, 10) + "...");

const resend = new Resend(apiKey);

async function runTest() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'AI Safety System <notifications@codevortex.in>',
      to: 'adilp4534@gmail.com',
      subject: 'Resend API Key Test Verification',
      html: '<p>If you see this, the Resend API key is valid!</p>'
    });

    if (error) {
      console.error("❌ Resend API Error Response:", error);
    } else {
      console.log("✅ Success! Mail response ID:", data.id);
    }
  } catch (err) {
    console.error("❌ Exception caught during email send:", err.message);
  }
}

runTest();
