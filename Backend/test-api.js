const axios = require('axios');

async function testApi() {
  const apiKey = "DVwHz-8472e530f513b1238417bbb4fcef806e-cec2b5350b5e7fdf04b88bf07f6ff182";
  const url = "https://api.mailersend.com/v1/email";

  const payload = {
    "from": {
      "email": "no-reply@codevortex.in",
      "name": "Test"
    },
    "to": [
      {
        "email": "codevortex131594@gmail.com"
      }
    ],
    "subject": "Test API",
    "html": "<p>Test</p>"
  };

  try {
    const res = await axios.post(url, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    console.log("Success:", res.data);
  } catch (e) {
    if (e.response) {
      console.log(`Status: ${e.response.status}, Data:`, e.response.data);
    } else {
      console.log(`Network Error`);
    }
  }
}

testApi();
