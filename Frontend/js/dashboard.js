/* ==========================
   🎥 CAMERA LIVE STREAM
========================== */

document.addEventListener("DOMContentLoaded", () => {
  const cameraImg = document.getElementById("ai-camera");
  if (cameraImg) {
    cameraImg.src = "http://127.0.0.1:5001/video_feed";
  }
});

/* ==========================
   🛡 AI STATUS
========================== */

const STATUS_URL = "http://127.0.0.1:5001/status";

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
        actionDesc.innerText = "System running normally";

        actionBox.classList.add("safe");
        actionBox.classList.remove("danger");
      }
      lastAction = action;
    }

  } catch (err) {
    console.error("❌ Status Fetch Error:", err);
  }
}

/* ==========================
   ⏱ AUTO UPDATE
========================== */

setInterval(updateStatus, 1000);
updateStatus();
