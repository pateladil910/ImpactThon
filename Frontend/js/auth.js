// document.addEventListener("DOMContentLoaded", () => {
//   const loginForm = document.getElementById("loginForm");

//   if (loginForm) {
//     loginForm.addEventListener("submit", login);
//   }

//   checkAuthUI();
// });

// function login(event) {
//   event.preventDefault();

//   const username = document.getElementById("username").value;
//   const password = document.getElementById("password").value;

//   const savedUsername = localStorage.getItem("savedUsername");
//   const savedPassword = localStorage.getItem("savedPassword");

//   if (username === savedUsername && password === savedPassword) {
//     localStorage.setItem("isLoggedIn", "true");
//     localStorage.setItem("username", username);
//     window.location.href = "index.html";
//   } else {
//     alert("Wrong username or password");
//   }
// }


// function logout() {
//   localStorage.removeItem("isLoggedIn");
//   localStorage.removeItem("username");
//   window.location.href = "login.html";
// }

// function checkAuthUI() {
//   const isLoggedIn = localStorage.getItem("isLoggedIn");
//   const username = localStorage.getItem("username");

//   const authButtons = document.getElementById("auth-buttons");
//   const profileSection = document.getElementById("profile-section");
//   const profileName = document.getElementById("profile-name");

//   if (isLoggedIn) {
//     if (authButtons) authButtons.style.display = "none";
//     if (profileSection) profileSection.style.display = "block";
//     if (profileName) profileName.textContent = username;
//   }
// }

// function signup(event) {
//   event.preventDefault();

//   const username = document.getElementById("signup-username").value;
//   const password = document.getElementById("signup-password").value;

//   if (!username || !password) {
//     alert("All fields are required");
//     return;
//   }

//   // Save user (demo purpose)
//   localStorage.setItem("savedUsername", username);
//   localStorage.setItem("savedPassword", password);

//   alert("Signup successful! Please login.");
//   window.location.href = "login.html";
// }
// Change this at the top of your auth.js
const API_BASE_URL = "https://impactthon-wjut.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", login);
  }
  checkAuthUI();
});

async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    // Logic changed: Fetch from Server instead of LocalStorage
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("username", username);
      window.location.href = "index.html";
    } else {
      alert(data.message || "Wrong username or password");
    }
  } catch (error) {
    alert("Connection error. Is the server waking up?");
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

async function signup(event) {
  event.preventDefault();

  // 1. Get ALL fields from your HTML
  const name = document.getElementById("signup-name").value; // Make sure this ID exists in HTML
  const email = document.getElementById("signup-email").value; // Make sure this ID exists in HTML
  const password = document.getElementById("signup-password").value;
  const role = "viewer"; // Or get from a dropdown

  if (!name || !email || !password) {
    alert("All fields (Name, Email, Password) are required");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 2. SEND ALL FIELDS to match backend
      body: JSON.stringify({ name, email, password, role }) 
    });

    if (response.ok) {
      alert("Signup successful! Please login.");
      window.location.href = "login.html";
    } else {
      const data = await response.json();
      alert(data.message || "Signup failed");
    }
  } catch (error) {
    alert("Error connecting to server.");
  }
}