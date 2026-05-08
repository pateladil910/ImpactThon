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

document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('userToken'); // or whatever key you use
    if (session) {
        window.location.href = '/index.html';
    }
});

async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value; // This is the user's email
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // CHANGE THIS LINE: Send 'email' instead of 'username'
      body: JSON.stringify({ email: username, password }) 
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("username", username);
      localStorage.setItem("token", data.token); // Store the JWT token for later
      window.location.href = "index.html";
    } else {
      // This will now show the actual error message like "User not found"
      alert(data.msg || "Login failed"); 
    }
  } catch (error) {
    alert("Connection error.");
  }
}

function logout() {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("username");
  localStorage.removeItem("token");
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

  const name = document.getElementById("signup-name").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role: "viewer" })
    });

    const data = await response.json();

    // SUCCESS CASE
    if (response.ok) {
      alert("Account created successfully!");
      window.location.href = "login.html";
      return; // Stop the function here
    } 
    else {
      alert(data.message || "Signup failed");
      return; // 👈 Stops the code
    }
    
  } catch (error) {
    // NETWORK CASE (Server is down or no internet)
    alert("Connection error. Please try again later.");
  }
}