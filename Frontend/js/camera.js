// camera.js
// Frontend ↔ Flask AI Status Connector

const SAFETY_TEXT = document.querySelector(".box.green .box-value");
const SYSTEM_ACTION = document.querySelector(".box.red .box-value");

async function fetchAIStatus() {
  try {
    const response = await fetch("http://127.0.0.1:5001/status");
    const data = await response.json();

    // Update Safety Zone
    if (data.zone === "SAFE") {
      SAFETY_TEXT.innerText = "SAFE";
      SAFETY_TEXT.parentElement.classList.remove("red");
      SAFETY_TEXT.parentElement.classList.add("green");
    } else {
      SAFETY_TEXT.innerText = "DANGER";
      SAFETY_TEXT.parentElement.classList.remove("green");
      SAFETY_TEXT.parentElement.classList.add("red");
    }

    // Update System Action
    SYSTEM_ACTION.innerText = data.action;

  } catch (error) {
    console.error("Failed to fetch AI status:", error);
  }
}

// Fetch every 1 second
setInterval(fetchAIStatus, 1000);
