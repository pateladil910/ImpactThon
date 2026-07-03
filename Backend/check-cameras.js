const mongoose = require('mongoose');
require('dotenv').config();
const Camera = require('./models/Camera');

async function run() {
  const dbUrl = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai_safety";
  console.log("Connecting to:", dbUrl);
  await mongoose.connect(dbUrl);
  const cameras = await Camera.find({});
  console.log("Cameras in database:", JSON.stringify(cameras, null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
