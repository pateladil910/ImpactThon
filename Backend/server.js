const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ SERVE PUBLIC FOLDER (THIS LINE IS CRITICAL)
app.use(express.static(path.join(__dirname, "public")));

// ✅ TEST STATUS API
app.get("/api/status", (req, res) => {
  res.json({
    danger: true,   // change true / false
    confidence: 92
  });
});

// ✅ START SERVER
app.listen(5000, () => {
  console.log("✅ Server running on http://localhost:5000");
});
