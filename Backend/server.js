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
const sendAlertEmail = require("./utils/sendEmail");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");

const app = express();

// 1. Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

app.use(cookieParser());
// app.use(express.json()); // Removed duplicate line

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

app.get("/api/status", (req, res) => {
  res.json({ danger: true, confidence: 92 });
});

// --- START OF ADDED/MODIFIED SECTION ---

// 5. Page Navigation Guards (The Fix)
app.get("/", (req, res) => {
  if (req.cookies.token) {
    return res.redirect("/index.html");
  }
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
});

app.get("/login.html", (req, res) => {
  if (req.cookies.token) {
    return res.redirect("/index.html");
  }
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
});

app.get("/index.html", (req, res) => {
  if (!req.cookies.token) {
    return res.redirect("/login.html");
  }
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
    await sendAlertEmail("✅ Test mail: Email system is working");
    console.log("✅ MAIL SENT SUCCESSFULLY");
  } catch (err) {
    console.error("❌ MAIL ERROR:", err);
  }
}, 3000);