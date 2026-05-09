const axios = require('axios');

async function testApi() {
  const apiKey = "DVwHz-8472e530f513b1238417bbb4fcef806e-cec2b5350b5e7fdf04b88bf07f6ff182";

  const endpoints = [
    "https://api.mailercloud.com/v1/mails/send",
    "https://cloudapi.mailercloud.com/v1/mails/send",
    "https://cloudapi.mailercloud.com/v1/emails/send"
  ];

  for (let url of endpoints) {
    try {
      console.log(`Testing ${url}...`);
      await axios.post(url, {}, {
        headers: { 'Authorization': apiKey }
      });
    } catch (e) {
      if (e.response) {
        console.log(`${url} -> Status: ${e.response.status}, Data:`, e.response.data);
      } else {
        console.log(`${url} -> Network Error`);
      }
    }
  }
}

testApi();
