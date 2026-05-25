
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





/*const API_BASE_URL = "https://impactthon-wjut.onrender.com";

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
  localStorage.removeItem("token") 

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

*/

const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://localhost:5000"
  : "https://impactthon-wjut.onrender.com";

// ---------------- LOGIN ----------------

async function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        email: username,
        password: password
      })
    });

    const data = await response.json();

    if (response.ok) {

      // UI session only
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("username", username);
      localStorage.setItem("userRole", data.role); // Save role for UI checks

      // redirect
      if (data.role === "admin") {
        window.location.replace("admin.html");
      } else {
        window.location.replace("index.html");
      }

    } else {

      alert(data.msg || "Login failed");
    }

  } catch (error) {

    console.error(error);
    alert("Connection error");
  }
}

// ---------------- SIGNUP ----------------

async function signup(event) {

  event.preventDefault();

  const name = document.getElementById("signup-name").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  try {

    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        name,
        email,
        password
      })
    });

    const data = await response.json();

    if (response.ok) {

      alert("Signup successful");
      window.location.replace("login.html");

    } else {

      alert(data.message || "Signup failed");
    }

  } catch (error) {

    console.error(error);
    alert("Connection error");
  }
}

// ---------------- LOGOUT ----------------

async function logout() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Backend logout failed:", error);
  }

  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("username");
  localStorage.removeItem("userRole");

  window.location.replace("login.html");
}

// ---------------- FORGOT & RESET PASSWORD ----------------

function showToast(message, isError = false) {
  const toast = document.getElementById("hudToast");
  const toastMsg = document.getElementById("toastMessage");
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  
  if (isError) {
    toast.classList.add("error");
  } else {
    toast.classList.remove("error");
  }

  toast.classList.add("active");

  setTimeout(() => {
    toast.classList.remove("active");
  }, 4000);
}

async function handleRequestReset(event) {
  event.preventDefault();
  const emailInput = document.getElementById("resetEmail");
  const requestBtn = document.getElementById("requestBtn");
  
  if (!emailInput || !requestBtn) return;
  const email = emailInput.value.trim();

  // Show loading state
  requestBtn.classList.add("loading");
  requestBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(data.msg || "Verification code dispatched successfully!", false);

      // Transition to Step 2
      const stepRequest = document.getElementById("step-request");
      const stepVerify = document.getElementById("step-verify");
      const verifyEmailDisplay = document.getElementById("verifyEmailDisplay");

      if (verifyEmailDisplay) {
        verifyEmailDisplay.value = email;
        verifyEmailDisplay.classList.add("has-value");
      }

      if (stepRequest && stepVerify) {
        stepRequest.classList.remove("step-visible");
        stepRequest.classList.add("step-hidden");

        stepVerify.classList.remove("step-hidden");
        stepVerify.classList.add("step-visible");
      }
    } else {
      showToast(data.msg || "Failed to generate recovery packet", true);
    }
  } catch (error) {
    console.error("Request Reset Error:", error);
    showToast("Network/Connection error. Please try again.", true);
  } finally {
    requestBtn.classList.remove("loading");
    requestBtn.disabled = false;
  }
}

async function handleVerifyReset(event) {
  event.preventDefault();

  const email = document.getElementById("verifyEmailDisplay").value;
  const code = document.getElementById("resetCode").value.trim();
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const verifyBtn = document.getElementById("verifyBtn");

  if (!email || !code || !newPassword || !confirmPassword || !verifyBtn) return;

  if (code.length !== 6 || isNaN(code)) {
    showToast("Verification code must be exactly 6 digits.", true);
    return;
  }

  if (newPassword.length < 6) {
    showToast("Password must be at least 6 characters.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("Passwords do not match.", true);
    return;
  }

  // Show loading state
  verifyBtn.classList.add("loading");
  verifyBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, code, newPassword })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(data.msg || "Password reset successful! Redirecting...", false);

      setTimeout(() => {
        window.location.replace("login.html");
      }, 2000);
    } else {
      showToast(data.msg || "Reset failed. Please verify your OTP.", true);
    }
  } catch (error) {
    console.error("Verify Reset Error:", error);
    showToast("Network/Connection error. Please try again.", true);
  } finally {
    verifyBtn.classList.remove("loading");
    verifyBtn.disabled = false;
  }
}

// ---------------- SOCIAL REGISTRATION (GOOGLE, FACEBOOK, APPLE) ----------------

let currentSocialProvider = "";

function injectSocialModalStyles() {
  if (document.getElementById("social-modal-styles")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "social-modal-styles";
  styleEl.innerHTML = `
    .social-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.85);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .social-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    .social-modal-card {
      width: 100%;
      max-width: 440px;
      background: rgba(8, 14, 27, 0.9);
      border: 1px solid var(--primary-neon);
      border-radius: 20px;
      box-shadow: 0 0 35px rgba(6, 182, 212, 0.35);
      padding: 35px 30px;
      color: #ffffff;
      font-family: 'Poppins', sans-serif;
      transform: scale(0.9) translateY(20px);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    .social-modal-overlay.active .social-modal-card {
      transform: scale(1) translateY(0);
    }
    .social-provider-hdr {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(6, 182, 212, 0.2);
      padding-bottom: 15px;
    }
    .social-provider-hdr svg {
      width: 32px;
      height: 32px;
    }
    .social-provider-hdr h3 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 20px;
      color: #ffffff;
      margin: 0;
    }
    .social-modal-close {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
      transition: color 0.2s;
    }
    .social-modal-close:hover {
      color: var(--primary-neon);
    }
    .social-input-group {
      margin-bottom: 20px;
      text-align: left;
    }
    .social-input-group label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .social-input-group input {
      width: 100%;
      padding: 12px 15px;
      background: rgba(2, 6, 23, 0.7);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 8px;
      color: #ffffff;
      outline: none;
      font-size: 14.5px;
      transition: all 0.2s;
    }
    .social-input-group input:focus {
      border-color: var(--primary-neon);
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
    }
    .social-auth-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, var(--primary-blue), var(--primary-neon));
      border: none;
      border-radius: 10px;
      color: #ffffff;
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(6, 182, 212, 0.25);
      transition: all 0.2s;
    }
    .social-auth-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(6, 182, 212, 0.4);
    }
  `;
  document.head.appendChild(styleEl);
}

function createSocialModal() {
  injectSocialModalStyles();
  
  if (document.getElementById("socialModalOverlay")) return;
  
  const overlay = document.createElement("div");
  overlay.id = "socialModalOverlay";
  overlay.className = "social-modal-overlay";
  overlay.innerHTML = `
    <div class="social-modal-card">
      <button class="social-modal-close" onclick="closeSocialModal()">&times;</button>
      <div class="social-provider-hdr">
        <span id="socialProviderIcon"></span>
        <h3 id="socialProviderTitle">Social Uplink</h3>
      </div>
      <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px; text-align: center;">
        Authorize AI Safety Shield to securely access your profile and establish an encrypted session linkage.
      </p>
      <form id="socialAuthForm">
        <div class="social-input-group">
          <label>Full Name</label>
          <input type="text" id="socialNameInput" placeholder="John Doe" required>
        </div>
        <div class="social-input-group">
          <label>Encrypted Email Address</label>
          <input type="email" id="socialEmailInput" placeholder="user@domain.com" required>
        </div>
        <button type="submit" class="social-auth-btn" id="socialAuthSubmitBtn">
          Establish Secure Link
        </button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  
  document.getElementById("socialAuthForm").addEventListener("submit", handleSocialSubmit);
}

async function handleSocialSubmit(event) {
  event.preventDefault();
  
  const name = document.getElementById("socialNameInput").value.trim();
  const email = document.getElementById("socialEmailInput").value.trim();
  const submitBtn = document.getElementById("socialAuthSubmitBtn");
  
  if (!email || !submitBtn) return;
  
  let roleSelection = "viewer";
  const mainRoleSelector = document.getElementById("signup-role");
  if (mainRoleSelector && mainRoleSelector.value) {
    roleSelection = mainRoleSelector.value;
  }
  
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Linking Secures...";
  submitBtn.disabled = true;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/social-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        email,
        provider: currentSocialProvider,
        roleSelection
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      closeSocialModal();
      
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("username", email);
      localStorage.setItem("userRole", data.role);
      
      if (typeof showToast === "function") {
        showToast(data.message || "Social linkage established!", false);
      } else {
        alert(data.message || "Social linkage established!");
      }
      
      setTimeout(() => {
        if (data.role === "admin") {
          window.location.replace("admin.html");
        } else {
          window.location.replace("index.html");
        }
      }, 1500);
      
    } else {
      alert(data.message || "Social verification failed.");
    }
  } catch (error) {
    console.error("Social Linkage Error:", error);
    alert("Connection error occurred during social verification.");
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function openSocialModal(provider) {
  currentSocialProvider = provider;
  createSocialModal();
  
  const title = document.getElementById("socialProviderTitle");
  const iconSpan = document.getElementById("socialProviderIcon");
  const emailInput = document.getElementById("socialEmailInput");
  const nameInput = document.getElementById("socialNameInput");
  
  if (provider === "google") {
    title.textContent = "Google Secure Uplink";
    iconSpan.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 32px; height: 32px; filter: drop-shadow(0 0 8px rgba(66, 133, 244, 0.4));">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
      </svg>
    `;
    emailInput.value = "admin@codevortex.in";
    nameInput.value = "Vortex Administrator";
  } else if (provider === "facebook") {
    title.textContent = "Facebook Secure Uplink";
    iconSpan.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="width: 32px; height: 32px; filter: drop-shadow(0 0 8px rgba(24, 119, 242, 0.4));">
        <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" fill="#1877F2"/>
      </svg>
    `;
    emailInput.value = "operator@codevortex.in";
    nameInput.value = "Vortex Operator";
  } else if (provider === "apple") {
    title.textContent = "Apple Secure Uplink";
    iconSpan.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="width: 32px; height: 32px; filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.84-.98 2.94.1.08 2.15-.52 2.81-1.33z" fill="#ffffff"/>
      </svg>
    `;
    emailInput.value = "viewer@codevortex.in";
    nameInput.value = "Vortex Viewer";
  }
  
  const overlay = document.getElementById("socialModalOverlay");
  if (overlay) overlay.classList.add("active");
}

function closeSocialModal() {
  const overlay = document.getElementById("socialModalOverlay");
  if (overlay) overlay.classList.remove("active");
}

window.openSocialModal = openSocialModal;
window.closeSocialModal = closeSocialModal;

// ---------------- UI ----------------

function checkAuthUI() {

  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const username = localStorage.getItem("username");
  const userRole = localStorage.getItem("userRole");

  const authButtons = document.getElementById("auth-buttons");
  const profileSection = document.getElementById("profile-section");
  const profileName = document.getElementById("profile-name");

  if (isLoggedIn === "true") {

    if (authButtons) {
      if (authButtons.querySelector('a[href*="login.html"]')) {
        authButtons.style.display = "none";
      }
    }

    if (profileSection) {
      profileSection.style.display = "flex";
    }

    if (profileName) {
      profileName.textContent = username;
    }

  } else {

    if (authButtons) {
      if (authButtons.querySelector('a[href*="login.html"]')) {
        authButtons.style.display = "flex";
      }
    }

    if (profileSection) {
      profileSection.style.display = "none";
    }
  }

  // 1. Case-Insensitive Admin Details Filter (Strict selectors to prevent page collisions)
  const isAdmin = isLoggedIn === "true" && userRole && userRole.toLowerCase() === "admin";
  const adminPages = ["admin.html", "diagnostics.html", "notifications.html", "incident_log.html"];

  adminPages.forEach(page => {
    const links = document.querySelectorAll(`.nav-menu a[href*="${page}"], .nav-links a[href*="${page}"]`);
    links.forEach(link => {
      const li = link.closest("li");
      if (li) {
        li.style.display = isAdmin ? "block" : "none";
      }
    });
  });

  // 2. Strict Camera Session Lock Filter (Dashboard, Danger Analytics, Detection Logs)
  const isCameraActive = localStorage.getItem("cameraActive") === "true";
  const cameraPages = ["dashboard.html", "dashboard2.html", "chart.html", "history.html"];

  cameraPages.forEach(page => {
    const links = document.querySelectorAll(`.nav-menu a[href*="${page}"], .nav-links a[href*="${page}"]`);
    links.forEach(link => {
      const li = link.closest("li");
      if (li) {
        li.style.display = isCameraActive ? "block" : "none";
      }
    });
  });
}

// ---------------- INIT ----------------

// document.addEventListener("DOMContentLoaded", () => {

//   const loginForm = document.getElementById("loginForm");
//   const signupForm = document.getElementById("signupForm");

//   if (loginForm) {
//     loginForm.addEventListener("submit", login);
//   }

//   if (signupForm) {
//     signupForm.addEventListener("submit", signup);
//   }

//   checkAuthUI();
// });

// document.addEventListener('DOMContentLoaded', () => {
//     // 1. Element Selectors
//     const menuToggle = document.getElementById('menuToggle');
//     const navLinks = document.getElementById('navLinks');
//     const myButton = document.getElementById('element-id-on-line-393');

//     // 2. Mobile Navigation Menu Logic
//     // This block only runs if both navigation elements exist on the current page.
//     if (menuToggle && navLinks) {
        
//         // Toggle the mobile menu when clicking the hamburger icon
//         menuToggle.addEventListener('click', (e) => {
//             e.stopPropagation();
//             menuToggle.classList.toggle('active');
//             navLinks.classList.toggle('active');
//         });

//         // Close the mobile menu automatically if a user clicks anywhere outside of it
//         document.addEventListener('click', (e) => {
//             if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
//                 menuToggle.classList.remove('active');
//                 navLinks.classList.remove('active');
//             }
//         });

//     } else {
//         // Safe fallback so your script doesn't crash on login/signup pages
//         console.log("Navigation elements not found on this page; skipping menu setup.");
//     }

//     // 3. Specific Button Logic (Line 393)
//     // This block only runs if this specific button exists on the current page.
//     if (myButton) {
//         myButton.addEventListener('click', () => {
//             console.log("Button 393 was clicked!");
            
//             /* 
//                👉 NOTE: Put your actual button action here. 
//                For example: alert('Button clicked!'); 
//             */
//         });
//     }
// });

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. ELEMENT SELECTORS
    // ==========================================
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    const myButton = document.getElementById('element-id-on-line-393');
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    // ==========================================
    // 2. MOBILE NAVIGATION MENU LOGIC
    // ==========================================
    if (menuToggle && navLinks) {
        // Toggle the mobile menu when clicking the hamburger icon
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close the mobile menu automatically if a user clicks anywhere outside of it
        document.addEventListener('click', (e) => {
            if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });
    } else {
        console.log("Navigation elements not found on this page; skipping menu setup.");
    }

    // ==========================================
    // 3. AUTHENTICATION LOGIC (UNCOMMENTED & FIXED)
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener("submit", login);
    }

    if (signupForm) {
        signupForm.addEventListener("submit", signup);
    }

    const requestResetForm = document.getElementById("requestResetForm");
    if (requestResetForm) {
        requestResetForm.addEventListener("submit", handleRequestReset);
    }

    const verifyResetForm = document.getElementById("verifyResetForm");
    if (verifyResetForm) {
        verifyResetForm.addEventListener("submit", handleVerifyReset);
    }

    // Social buttons click listeners removed to prevent conflicts with official Firebase SDK triggers

    // Runs your UI check (make sure this function is defined elsewhere in your project!)
    if (typeof checkAuthUI === "function") {
        checkAuthUI();
    }

    // ==========================================
    // 4. SPECIFIC BUTTON LOGIC (LINE 393)
    // ==========================================
    if (myButton) {
        myButton.addEventListener('click', () => {
            console.log("Button 393 was clicked!");
            // Add your button's actual functionality here if needed
        });
    }
});