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

const STATUS_URL = "https://impactthon-wjut.onrender.com/api/status";

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
    const response = await fetch('/api/camera/latest');
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

document.addEventListener('DOMContentLoaded', startLiveSurveillance);
/* ==========================
    ⏱ AUTO UPDATE
========================== */

setInterval(updateStatus, 1000);
updateStatus();