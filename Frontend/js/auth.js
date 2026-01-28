document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", login);
  }

  checkAuthUI();
});

function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const savedUsername = localStorage.getItem("savedUsername");
  const savedPassword = localStorage.getItem("savedPassword");

  if (username === savedUsername && password === savedPassword) {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("username", username);
    window.location.href = "index.html";
  } else {
    alert("Wrong username or password");
  }
}


function logout() {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("username");
  window.location.href = "login.html";
}

function checkAuthUI() {
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");

  const authButtons = document.getElementById("auth-buttons");
  const profileSection = document.getElementById("profile-section");
  const profileName = document.getElementById("profile-name");

  if (isLoggedIn) {
    if (authButtons) authButtons.style.display = "none";
    if (profileSection) profileSection.style.display = "block";
    if (profileName) profileName.textContent = username;
  }
}

function signup(event) {
  event.preventDefault();

  const username = document.getElementById("signup-username").value;
  const password = document.getElementById("signup-password").value;

  if (!username || !password) {
    alert("All fields are required");
    return;
  }

  // Save user (demo purpose)
  localStorage.setItem("savedUsername", username);
  localStorage.setItem("savedPassword", password);

  alert("Signup successful! Please login.");
  window.location.href = "login.html";
}
