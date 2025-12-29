function login(event) {
  event.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  // TEMP LOGIN CHECK
  if (username === "CodeV" && password === "1234") {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("username", username);
    window.location.href = "../index.html";
  } else {
    alert("Wrong username or password");
  }
}

function signup() {
  alert("Signup successful (demo)");
  window.location.href = "login.html";
}
