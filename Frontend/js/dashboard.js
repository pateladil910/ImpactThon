/* ==========================
    🎥 CAMERA LIVE STREAM
========================== */

document.addEventListener("DOMContentLoaded", () => {
  const cameraImg = document.getElementById("ai-camera");
  if (cameraImg) {
    // CHANGE: We moved the .src assignment inside startLiveSurveillance 
    // to use the persistent database URL.
  }
});

/* ==========================
    🛡 AI STATUS
========================== */

const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://localhost:5000"
  : "https://impactthon-wjut.onrender.com";

const STATUS_URL = `${API_BASE_URL}/api/status`;

let lastSafety = null;
let lastAction = null;

async function updateStatus() {
  try {
    const res = await fetch(STATUS_URL, { cache: "no-store" });
    const data = await res.json();

    const safetyBox = document.getElementById("safety-box");
    const safetyStatus = document.getElementById("safety-status");
    const safetyDesc = document.getElementById("safety-desc");

    const actionBox = document.getElementById("action-box");
    const actionStatus = document.getElementById("system-action");
    const actionDesc = document.getElementById("system-desc");

    if (!safetyBox || !actionBox) return;

    /* ===== SAFETY UI ===== */
    if (data.safety !== lastSafety) {
      if (data.safety === "DANGER") {
        safetyStatus.innerText = "DANGER";
        safetyDesc.innerText = "Human detected inside danger zone";

        safetyBox.classList.add("danger");
        safetyBox.classList.remove("safe");
      } else {
        safetyStatus.innerText = "SAFE";
        safetyDesc.innerText = "Human distance above threshold";

        safetyBox.classList.add("safe");
        safetyBox.classList.remove("danger");
      }
      lastSafety = data.safety;
    }

    /* ===== SYSTEM ACTION ===== */
    const action = data.safety === "DANGER" ? "STOP" : "RUN";

    if (action !== lastAction) {
      if (action === "STOP") {
        actionStatus.innerText = "STOP";
        actionDesc.innerText = "Emergency stop activated";

        actionBox.classList.add("danger");
        actionBox.classList.remove("safe");
      } else {
        actionStatus.innerText = "RUN";
        actionDesc.innerText = "System normally";

        actionBox.classList.add("safe");
        actionBox.classList.remove("danger");
      }
      lastAction = action;
    }

  } catch (err) {
    console.error("❌ Status Fetch Error:", err);
  }
}

async function startLiveSurveillance() {
  try {
    // Fetch the 'Life-Long' saved camera from MongoDB
    const response = await fetch(`${API_BASE_URL}/api/camera/latest`);
    const data = await response.json();

    if (data.success && data.camera) {
      const cam = data.camera;
      console.log(`🚀 Starting stream for: ${cam.name}`);

      // REQUIRED CHANGE: Apply the saved URL to the camera image
      const cameraImg = document.getElementById("ai-camera");
      if (cameraImg) {
        // We pass the cam.url to your AI service as a parameter
        cameraImg.src = `https://impactthon-ai.onrender.com/video_feed?source=${encodeURIComponent(cam.url)}`;
      }
    } else {
      // If no camera found, send them back to setup
      window.location.href = "camera_setup.html";
    }
  } catch (err) {
    console.error("Failed to load saved camera settings.");
  }
}

/* ==========================
   🚪 CAMERA LOGOUT LOGIC
========================== */
// We use a specific listener for the ID to ensure it triggers even if other errors exist
async function handleLogout(event) {
  event.preventDefault();
  console.log("Logout initiated...");

  if (!confirm("Are you sure you want to disconnect this camera?")) return;

  try {
    // Use the absolute path to your web service to be safe
    const response = await fetch(`${API_BASE_URL}/api/camera/reset`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      alert("Camera Disconnected Successfully.");
      window.location.href = "camera_setup.html";
    }
  } catch (err) {
    console.error("Logout Error:", err);
    // Even if the server fails, we can force a redirect if needed
    alert("Logout failed on server, but redirecting to setup.");
    window.location.href = "camera_setup.html";
  }
}

// Attach the listener manually to be 100% sure
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnLogoutCam');
  if (btn) {
    btn.onclick = handleLogout;
  }
});

// Add this at the VERY BOTTOM of dashboard.js
document.addEventListener('click', async (event) => {
  // Check if the clicked element (or its parent) is the logout button
  const logoutBtn = event.target.closest('#btnLogoutCam');

  if (logoutBtn) {
    event.preventDefault(); // Stop any default link behavior
    console.log("Logout button clicked!");

    if (!confirm("Are you sure you want to disconnect this camera?")) return;

    try {
      // 1. Tell the server to delete the camera entry
      const response = await fetch(`${API_BASE_URL}/api/camera/reset`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        console.log("Success! Camera removed.");
        // 2. Hard redirect to the setup page
        window.location.href = "camera_setup.html";
      } else {
        alert("Server error: " + data.message);
      }
    } catch (err) {
      console.error("Network error during logout:", err);
      alert("Could not connect to server to logout.");
    }
  }
});

document.addEventListener('DOMContentLoaded', startLiveSurveillance);
/* ==========================
    ⏱ AUTO UPDATE
========================== */

setInterval(updateStatus, 1000);
updateStatus();