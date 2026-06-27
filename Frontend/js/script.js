/* ===========================
   🔐 LOGIN / LOGOUT HANDLER
=========================== */
document.addEventListener("DOMContentLoaded", () => {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");

  const authButtons = document.querySelector(".auth-buttons");
  const profileSection = document.getElementById("profile-section");
  const profileName = document.getElementById("profile-name");

  // ⚠️ If navbar elements not present, stop
  if (!authButtons || !profileSection) return;

  if (isLoggedIn === "true") {
    authButtons.style.display = "none";
    profileSection.style.display = "flex";
    profileName.textContent = username || "CodeV";
  } else {
    authButtons.style.display = "flex";
    profileSection.style.display = "none";
  }
});

/* ===========================
   🚪 LOGOUT FUNCTION
=========================== */
function logout() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch(e) {}
  window.location.replace("login.html");
}

/* ===========================
   📡 LIVE STATUS DASHBOARD
=========================== */
async function loadStatus() {

  // Get elements safely
  const safetyText  = document.getElementById("safetyStatus");
  const machineText = document.getElementById("machineStatus");
  const actionText  = document.getElementById("actionStatus");
  const aiText      = document.getElementById("aiConfidence");

  // ❌ Stop if page is not dashboard
  if (!safetyText || !machineText || !actionText || !aiText) {
    return;
  }

  try {
    const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
      ? "http://localhost:5000"
      : "https://impactthon-wjut.onrender.com";

    const res = await fetch(`${API_BASE_URL}/api/status`);
    const data = await res.json();

    if (data.danger === true) {
      // 🔴 DANGER MODE
      safetyText.innerText = "DANGER";
      safetyText.className = "status-text danger";

      machineText.innerText = "OFF";
      machineText.className = "status-text off";

      actionText.innerText = "STOP";
      actionText.className = "status-text stop";

      aiText.innerText = data.confidence + "%";
    } else {
      // 🟢 SAFE MODE
      safetyText.innerText = "SAFE";
      safetyText.className = "status-text safe";

      machineText.innerText = "ON";
      machineText.className = "status-text on";

      actionText.innerText = "RUNNING";
      actionText.className = "status-text safe";

      aiText.innerText = data.confidence + "%";
    }

  } catch (err) {
    console.error("API error:", err);
  }
}

/* ===========================
   🔄 AUTO REFRESH (2 SEC)
=========================== */

// Load once on page open
loadStatus();

// Refresh every 2 seconds
setInterval(loadStatus, 2000);
