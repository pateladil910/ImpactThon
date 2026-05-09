const axios = require('axios');

async function testApi() {
  const apiKey = "DVwHz-8472e530f513b1238417bbb4fcef806e-cec2b5350b5e7fdf04b88bf07f6ff182";
  const url = "https://cloudapi.mailercloud.com/v1/mails/send";

  // Try different payloads
  const payload1 = {
    from: { email: "adilp4534@gmail.com", name: "System" },
    to: [{ email: "codevortex131594@gmail.com" }],
    subject: "Test",
    html: "<p>Test</p>"
  };

  const payload2 = {
    from: "adilp4534@gmail.com",
    from_name: "System",
    to: "codevortex131594@gmail.com",
    subject: "Test",
    content: "Test",
    type: "html" // Mailercloud's old v1 format
  };

  const payload3 = {
    from: { email: "adilp4534@gmail.com" },
    to: [{ email: "codevortex131594@gmail.com" }],
    subject: "Test",
    content: [{ type: "text/html", value: "Test" }]
  };

  for (const [idx, p] of [payload1, payload2, payload3].entries()) {
    try {
      console.log(`Trying Payload ${idx+1}...`);
      const res = await axios.post(url, p, {
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
      });
      console.log(`Payload ${idx+1} Success:`, res.data);
    } catch (e) {
      if (e.response) {
        console.log(`Payload ${idx+1} Error:`, e.response.status, JSON.stringify(e.response.data));
      } else {
        console.log(`Payload ${idx+1} Network Error:`, e.message);
      }
    }
  }
}

testApi();
