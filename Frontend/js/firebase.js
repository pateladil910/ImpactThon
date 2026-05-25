import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDI9Nzw4fnurxbDiLKeAEXVjH6ZnMGFOCU",
  authDomain: "codevortex-3e1a7.firebaseapp.com",
  projectId: "codevortex-3e1a7",
  storageBucket: "codevortex-3e1a7.firebasestorage.app",
  messagingSenderId: "197292477520",
  appId: "1:197292477520:web:cfb16f4b49240bbd779555",
  measurementId: "G-L5RCY0NGM6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Apply Google Auth parameters for standard select account popup experience
provider.setCustomParameters({
  prompt: 'select_account'
});

export { auth, provider, signInWithPopup, signOut, onAuthStateChanged };
