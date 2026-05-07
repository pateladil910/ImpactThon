// const mongoose = require("mongoose");

// const connectDB = async () => {
//   try {
//     await mongoose.connect("mongodb://127.0.0.1:27017/ai_safety");
//     console.log("MongoDB Connected");
//   } catch (error) {
//     console.error("MongoDB connection failed", error);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // 1. Try to find the Render variable first, then fallback to local for development
    const dbUrl = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai_safety";
    
    await mongoose.connect(dbUrl);
    console.log("✅ MongoDB Connected to Atlas");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;