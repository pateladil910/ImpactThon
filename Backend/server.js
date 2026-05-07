const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const detectionRoutes = require("./routes/detection");
const analyticsRoutes = require("./routes/analytics");
const sendAlertEmail = require("./utils/sendEmail");
const connectDB = require("./config/db");

const app = express();

app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
// ---------------------------

app.use(express.json());

// Connect to Database
connectDB();

app.use(cors());
app.use(express.json());

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/detection", detectionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/auth", authRoutes);
// app.use("/api", require("./routes/alert").router);

// Test API
app.get("/api/status", (req, res) => {
  res.json({
    danger: true,
    confidence: 92
  });
});

// Start server
app.listen(5000, () => {
  console.log("✅ Server running on https://impactthon-wjut.onrender.com");
});

// 🔥 EMAIL TEST (auto after 3 sec)
setTimeout(async () => {
  try {
    await sendAlertEmail("✅ Test mail: Email system is working");
    console.log("✅ MAIL SENT SUCCESSFULLY");
  } catch (err) {
    console.error("❌ MAIL ERROR:", err);
  }
}, 3000);
