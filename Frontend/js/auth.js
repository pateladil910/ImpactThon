
// const API_BASE_URL = "https://impactthon-wjut.onrender.com";

// document.addEventListener('DOMContentLoaded', () => {
//   const session = localStorage.getItem('userToken'); // or whatever key you use
//   if (session) {
//     window.location.href = '/index.html';
//   }
// });

// async function login(event) {
//   event.preventDefault();

//   const username = document.getElementById("username").value; // This is the user's email
//   const password = document.getElementById("password").value;

//   try {
//     const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       // CHANGE THIS LINE: Send 'email' instead of 'username'
//       body: JSON.stringify({ email: username, password })
//     });

//     const data = await response.json();

//     if (response.ok) {
//       localStorage.setItem("isLoggedIn", "true");
//       localStorage.setItem("username", username);
//       localStorage.setItem("token", data.token); // Store the JWT token for later
//       // window.location.href = "index.html";
//       window.location.href = "/";

//     } else {
//       // This will now show the actual error message like "User not found"
//       alert(data.msg || "Login failed");
//     }
//   } catch (error) {
//     alert("Connection error.");
//   }
// }

// function logout() {
//   localStorage.removeItem("isLoggedIn");
//   localStorage.removeItem("username");
//   localStorage.removeItem("token");
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

// async function signup(event) {
//   event.preventDefault();

//   const name = document.getElementById("signup-name").value;
//   const email = document.getElementById("signup-email").value;
//   const password = document.getElementById("signup-password").value;

//   try {
//     const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email, password }), // Removed name/role for login
//       credentials: 'include' // 👈 IMPORTANT: Allows browser to save the cookie
//     });

//     const data = await response.json();

//     if (response.ok) {
//       // 1. Change this alert
//       alert("Login successful!");

//       // 2. CHANGE THIS LINE: Redirect to index, not login.html
//       window.location.href = "index.html";
//       return;
//     } else {
//       alert(data.msg || "Login failed"); // Note: your backend used 'msg' for errors
//       return;
//     }

//   } catch (error) {
//     alert("Connection error. Please try again later.");
//   }

const API_BASE_URL = "https://impactthon-wjut.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === "true") {
        window.location.href = "index.html";
    }
});

// --- AUTHENTICATION LOGIC --


async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value; // The email input
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
      credentials: 'include' // 👈 This allows the browser to save the cookie
    });

    const data = await response.json();

    if (response.ok) {
      // Keep your UI state safe
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("username", username);

      localStorage.setItem("token", data.token); // Store the JWT token for later
      window.location.href = "index.html";


      // Navigate to root - the server will now see the cookie and allow access
      window.location.href = "/index.html";


      // Navigate to root - the server will now see the cookie and allow access
      window.location.href = "/index.html";

    } else {
      alert(data.msg || "Login failed");
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Connection error.");
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
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (response.ok) {
      alert("Account created successfully! Please login.");
      window.location.href = "login.html";
    } else {
      alert(data.message || "Signup failed");
    }
  } catch (error) {
    alert("Connection error. Please try again later.");
  }
}

function logout() {
  // Clear local storage for the UI
   /*localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("username");
  localStorage.removeItem("token") */
  
  localStorage.removeItem("isLoggedIn", "true");
  localStorage.removeItem("username", username);
  localStorage.removeItem("token", data.token);

  // Note: For a full logout, you'd ideally call a backend /logout 
  // to clear the cookie, but this will get the user back to login.
  window.location.href = "/index.html";
}

// --- UI UPDATES (Your existing logic kept safe) ---

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

// Initialize UI on page load
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  if (loginForm) loginForm.addEventListener("submit", login);
  if (signupForm) signupForm.addEventListener("submit", signup);

  checkAuthUI();
});