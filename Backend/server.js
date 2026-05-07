// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config();

// const authRoutes = require("./routes/auth");
// const detectionRoutes = require("./routes/detection");
// const analyticsRoutes = require("./routes/analytics");
// const sendAlertEmail = require("./utils/sendEmail");
// const connectDB = require("./config/db");

// const app = express();

// app.use(cors({
//   origin: "*",
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"]
// }));
// // ---------------------------

// app.use(express.json());

// // Connect to Database
// connectDB();
// app.use(express.static(path.join(__dirname, "..", "Frontend")));

// // Serve the login page on root URL
// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
// });

// // Serve public folder
// app.use(express.static(path.join(__dirname, "..", "Frontend", "pages")));

// app.use("/api/detection", detectionRoutes);
// app.use("/api/analytics", analyticsRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/history", analyticsRoutes);
// // app.use("/api", require("./routes/alert").router);



// // 2. This keeps the /login link working too
// app.get("/login", (req, res) => {
//   res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
// });
// // Test API
// app.get("/api/status", (req, res) => {
//   res.json({
//     danger: true,
//     confidence: 92
//   });
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });

// // 🔥 EMAIL TEST (auto after 3 sec)
// setTimeout(async () => {
//   try {
//     await sendAlertEmail("✅ Test mail: Email system is working");
//     console.log("✅ MAIL SENT SUCCESSFULLY");
//   } catch (err) {
//     console.error("❌ MAIL ERROR:", err);
//   }
// }, 3000);

// // This one block handles /, /login, and any other page safely
// app.use((req, res, next) => {
//   if (req.path.startsWith('/api')) {
//     return next(); // If it's an API call, move on
//   }
//   res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
// });


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

// 1. Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// 2. Connect to Database
connectDB();

// 3. Static Files (Tell Express where your CSS/JS/Images are)
app.use(express.static(path.join(__dirname, "..", "Frontend")));
app.use(express.static(path.join(__dirname, "..", "Frontend", "pages")));

// 4. API Routes
app.use("/api/detection", detectionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/history", analyticsRoutes);

app.get("/api/status", (req, res) => {
  res.json({ danger: true, confidence: 92 });
});

// 5. MASTER FALLBACK (Handles /, /login, and all other pages)
// Put this AFTER API routes but BEFORE app.listen
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next(); 
  }
  res.sendFile(path.join(__dirname, "..", "Frontend", "pages", "login.html"));
});

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