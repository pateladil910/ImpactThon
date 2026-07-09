// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config();

// const authRoutes = require("./routes/auth");
// const detectionRoutes = require("./routes/detection");
// const analyticsRoutes = require("./routes/analytics");
// const sendAlertEmail = require("./utils/sendEmail");
// const connectDB = require("./config/db");
// const cookieParser = require("cookie-parser");

// const app = express();

// // 1. Middleware
// app.use(cors({
//   origin: "*",
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"]
// }));
// app.use(express.json());

// app.use(cookieParser());
// app.use(express.json());

// // 2. Connect to Database
// connectDB();

// // 3. Static Files (Tell Express where your CSS/JS/Images are)
// app.use(express.static(path.join(__dirname, "..", "Frontend")));
// app.use(express.static(path.join(__dirname, "..", "Frontend", "pages")));

// // 4. API Routes
// app.use("/api/detection", detectionRoutes);
// app.use("/api/analytics", analyticsRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/history", analyticsRoutes);

// app.get("/api/status", (req, res) => {
//   res.json({ danger: true, confidence: 92 });
// });

// app.use((req, res, next) => {
//   if (req.path.startsWith('/api')) {
//     return next();
//   }
//   res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
// });

// // 6. Start Server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });

// // 🔥 EMAIL TEST
// setTimeout(async () => {
//   try {
//     await sendAlertEmail("✅ Test mail: Email system is working");
//     console.log("✅ MAIL SENT SUCCESSFULLY");
//   } catch (err) {
//     console.error("❌ MAIL ERROR:", err);
//   }
// }, 3000);

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const detectionRoutes = require("./routes/detection");
const analyticsRoutes = require("./routes/analytics");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact"); // NEW
const cameraRoutes = require("./routes/camera");
const incidentRoutes = require("./routes/incident");
const sendAlertEmail = require("./utils/sendEmail");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");

const app = express();

const allowedOrigins = [
  "https://codevortex.in",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    const isCodevortex = origin && (origin.endsWith("codevortex.in") || origin.endsWith("codevortex.in/"));
    if (!origin || origin === "null" || isCodevortex || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(cookieParser());

// 2. Connect to Database
connectDB();

// 3. Static Files
app.use(express.static(path.join(__dirname, "..", "Frontend"), { index: false }));
app.use(express.static(path.join(__dirname, "..", "Frontend", "pages"), { index: false }));

// 4. API Routes
app.use("/api/detection", detectionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/history", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes); // NEW
app.use("/api/camera", cameraRoutes);
app.use("/api/incident", incidentRoutes);

const axios = require("axios");

// Utility to check if IP is private/local
function isPrivateIP(urlStr) {
  if (!urlStr) return false;
  try {
    let cleanUrl = urlStr.toLowerCase().trim();
    
    // Extract host/ip
    // 1. Remove protocol schema
    cleanUrl = cleanUrl.replace(/^(rtsp|rtmp|http|https):\/\//, '');
    // 2. Remove credentials if present (anything before last '@')
    if (cleanUrl.includes('@')) {
      cleanUrl = cleanUrl.substring(cleanUrl.lastIndexOf('@') + 1);
    }
    // 3. Remove port and path (anything starting with ':' or '/')
    const endIdx = cleanUrl.search(/[:\/]/);
    if (endIdx !== -1) {
      cleanUrl = cleanUrl.substring(0, endIdx);
    }
    
    // Pure digit check (e.g. USB index "0", "1")
    if (/^\d+$/.test(cleanUrl)) return true;
    
    if (cleanUrl === 'localhost' || cleanUrl === '127.0.0.1') return true;
    if (cleanUrl.startsWith('192.168.')) return true;
    if (cleanUrl.startsWith('10.')) return true;
    
    // Match 172.16.x.x to 172.31.x.x
    const match = cleanUrl.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
    if (match) return true;
    
    return false;
  } catch (e) {
    return false;
  }
}

app.get("/api/test_camera", async (req, res) => {
  const { source, username, password } = req.query;
  if (!source) {
    return res.status(400).json({ status: "error", message: "Source URL is required" });
  }

  const isLocal = isPrivateIP(source);
  if (isLocal) {
    return res.status(200).json({
      status: "error",
      isLocal: true,
      message: "Private local IP cameras cannot be accessed directly from cloud deployment. Please run your Local Edge Agent."
    });
  }

  try {
    // Proxy request to the Cloud AI service
    const aiServiceUrl = process.env.AI_SERVICE_URL || "https://impactthon-ai.onrender.com";
    const response = await axios.get(`${aiServiceUrl}/api/test_camera`, {
      params: { source, username, password },
      timeout: 10000
    });
    return res.status(200).json(response.data);
  } catch (err) {
    console.error("Error proxying test_camera to AI service:", err.message);
    return res.status(200).json({
      status: "error",
      message: "Camera verification failed via cloud service."
    });
  }
});

app.get("/status", async (req, res) => {
  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:10000";
    const response = await axios.get(`${aiServiceUrl}/status`, { timeout: 3000 });
    return res.status(200).json(response.data);
  } catch (err) {
    return res.status(200).json({
      camera_status: "Offline",
      human_count: 0,
      ai_confidence: 0,
      danger_state: "SAFE",
      machine_state: "RUN",
      fps: 0.0,
      latency: 0.0,
      last_detection_time: "--"
    });
  }
});

app.get("/api/status", async (req, res) => {
  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:10000";
    const response = await axios.get(`${aiServiceUrl}/status`, { timeout: 3000 });
    const data = response.data;
    return res.status(200).json({
      ...data,
      danger: data.danger_state === "DANGER",
      confidence: data.ai_confidence,
      zone: data.danger_state,
      action: data.machine_state
    });
  } catch (err) {
    return res.status(200).json({
      danger: false,
      confidence: 0,
      zone: "SAFE",
      action: "RUN"
    });
  }
});

// --- START OF ADDED/MODIFIED SECTION ---

// 5. Page Navigation Guards (The Fix)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "index.html"));
});

app.get("/login.html", (req, res) => {
  if (req.cookies.token) {
    return res.redirect("/index.html");
  }
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "index.html"));
});

// Master Fallback (Only for non-API routes)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  // Redirect unknown pages to index if logged in, else login
  if (req.cookies.token) {
    return res.redirect("/index.html");
  }
  res.redirect("/login.html");
});

// --- END OF ADDED/MODIFIED SECTION ---

// 6. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// 🔥 EMAIL TEST
setTimeout(async () => {
  try {
    await sendAlertEmail("✅ Test mail: API system is working", "testuser@gmail.com", "Test Admin");
    console.log("✅ MAILCLOUD API SENT SUCCESSFULLY");
  } catch (err) {
    console.error("❌ MAILCLOUD API ERROR:", err.message);
  }
}, 3000);