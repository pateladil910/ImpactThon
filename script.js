function updateDashboard(data){

  document.getElementById("zoneText").innerText = data.zone;
  document.getElementById("machineText").innerText = data.machine;
  document.getElementById("confidenceText").innerText = data.confidence + "%";

  document.querySelectorAll(".zone").forEach(z => z.classList.remove("active"));

  if(data.zone === "SAFE"){
    document.getElementById("safeZone").classList.add("active");
  }
  if(data.zone === "WARNING"){
    document.getElementById("warnZone").classList.add("active");
  }
  if(data.zone === "DANGER"){
    document.getElementById("dangerZone").classList.add("active");
  }
}

// 🔁 Dummy data (replace with backend API)
setInterval(() => {
  const demoData = {
    zone: "DANGER",   // SAFE | WARNING | DANGER
    machine: "OFF",   // ON | OFF
    confidence: 92
  };
  updateDashboard(demoData);
}, 1500);

window.onload = function () {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");

  if (isLoggedIn === "true") {
    document.getElementById("auth-buttons").style.display = "none";
    document.getElementById("profile-section").style.display = "flex";
    document.getElementById("profile-name").innerText = username || "Profile";
  }
};

function logout() {
  localStorage.clear();
  window.location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");

  const authButtons = document.getElementById("auth-buttons");
  const profileSection = document.getElementById("profile-section");

  if (isLoggedIn === "true") {
    authButtons.style.display = "none";
    profileSection.style.display = "flex";
    document.getElementById("profile-name").innerText = username || "User";
  } else {
    authButtons.style.display = "flex";
    profileSection.style.display = "none";
  }
});

function logout() {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("username");
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");

  const authButtons = document.getElementById("auth-buttons");
  const profileSection = document.getElementById("profile-section");
  const profileName = document.getElementById("profile-name");

  // 🚨 IMPORTANT: Prevent error on login/signup pages
  if (!authButtons || !profileSection) return;

  if (isLoggedIn === "true") {
    authButtons.style.display = "none";
    profileSection.style.display = "flex";
    profileName.innerText = username || "User";
  } else {
    authButtons.style.display = "flex";
    profileSection.style.display = "none";
  }
});

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}
