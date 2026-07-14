if (typeof window.API_BASE_URL === 'undefined') {
  window.API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
    ? "http://localhost:5000"
    : "https://impactthon-wjut.onrender.com";
}
var API_BASE_URL = window.API_BASE_URL;
var ADMIN_API_BASE = `${API_BASE_URL}/api/admin`;

// Helper: retrieve secure JWT header
function getAuthHeaders() {
  const token = localStorage.getItem("token") || "";
  return {
    "Authorization": token ? `Bearer ${token}` : "",
    "Cache-Control": "no-cache"
  };
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Load initial dashboard metrics, operators, and logs
  loadDashboardData();

  // 2. Set up real-time 3-second auto-refresh polling loop
  setInterval(loadDashboardData, 3000);
});

async function loadDashboardData() {
  try {
    // Fetch Stats with cache buster
    const statsRes = await fetch(`${ADMIN_API_BASE}/stats?t=${Date.now()}`, {
      credentials: "include",
      headers: getAuthHeaders()
    });

    if (statsRes.status === 401 || statsRes.status === 403) {
      // Access Denied! Log out immediately.
      alert("Access Denied. You are not authorized as an administrator.");
      window.location.replace("index.html");
      return;
    }

    const statsData = await statsRes.json();
    if (statsData.success) {
      document.getElementById("stat-users").textContent = statsData.stats.totalUsers;
      document.getElementById("stat-detections").textContent = statsData.stats.totalDetections;
      document.getElementById("stat-incidents").textContent = statsData.stats.totalIncidents;
    }

    // Load Users (if Admin is not currently focusing on role selection dropdown)
    const isAnySelectFocused = document.activeElement && document.activeElement.classList.contains("role-select");
    if (!isAnySelectFocused) {
      loadUsers();
    }
    
    // Load Contacts
    loadContacts();

  } catch (error) {
    console.error("Dashboard real-time polling error:", error);
  }
}

async function loadContacts() {
  try {
    const res = await fetch(`${ADMIN_API_BASE}/contacts?t=${Date.now()}`, {
      credentials: "include",
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      renderContactsTable(data.contacts);
    }
  } catch (error) {
    console.error("Failed to load contacts in real-time:", error);
  }
}

function renderContactsTable(contacts) {
  const tbody = document.getElementById("contacts-tbody");
  tbody.innerHTML = "";
  
  if (contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No inbound messages yet.</td></tr>';
    return;
  }

  contacts.forEach(msg => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = new Date(msg.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    tr.appendChild(tdDate);

    const tdName = document.createElement("td");
    tdName.textContent = msg.name;
    tr.appendChild(tdName);

    const tdEmail = document.createElement("td");
    tdEmail.textContent = msg.email;
    tr.appendChild(tdEmail);

    const tdMessage = document.createElement("td");
    tdMessage.textContent = msg.message;
    tr.appendChild(tdMessage);

    tbody.appendChild(tr);
  });
}

async function loadUsers() {
  try {
    const res = await fetch(`${ADMIN_API_BASE}/users?t=${Date.now()}`, {
      credentials: "include",
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success) {
      renderUsersTable(data.users);
    }
  } catch (error) {
    console.error("Failed to load users in real-time:", error);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");

    // 1. Name
    const tdName = document.createElement("td");
    tdName.textContent = user.name || "Operator";
    tr.appendChild(tdName);

    // 2. Email Address
    const tdEmail = document.createElement("td");
    tdEmail.textContent = user.email;
    tr.appendChild(tdEmail);

    // 3. Active Cameras (Status Badge)
    const tdCameras = document.createElement("td");
    if (!user.camerasCount || user.camerasCount === 0) {
      tdCameras.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; color:#94a3b8;">No Cameras</span>`;
    } else if (user.activeCamerasCount > 0) {
      tdCameras.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; color:#10b981; text-shadow:0 0 8px rgba(16,185,129,0.3);"><span style="width:6px; height:6px; background-color:#10b981; border-radius:50%; box-shadow:0 0 8px #10b981;"></span>Online (${user.activeCamerasCount}/${user.camerasCount})</span>`;
    } else {
      tdCameras.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; color:#ef4444; text-shadow:0 0 8px rgba(239,68,68,0.3);"><span style="width:6px; height:6px; background-color:#ef4444; border-radius:50%; box-shadow:0 0 8px #ef4444;"></span>Offline (0/${user.camerasCount})</span>`;
    }
    tr.appendChild(tdCameras);

    // 4. Danger Intrusions (Breaches)
    const tdDetections = document.createElement("td");
    const count = user.dangerCount || 0;
    tdDetections.innerHTML = `<span style="font-weight:bold; color:#4DE6D6; text-shadow:0 0 8px rgba(77,230,214,0.3);">${count} ${count === 1 ? 'breach' : 'breaches'}</span>`;
    tr.appendChild(tdDetections);

    // 5. Alert Emails (Sent / Failed Status)
    const tdEmails = document.createElement("td");
    tdEmails.innerHTML = `
      <div style="display:inline-flex; flex-direction:column; gap:2px; font-size:11px; font-family:'Fira Code', monospace; line-height:1.2;">
        <span style="color:#10b981; font-weight:bold;">📬 ${user.emailAlertsSent || 0} Sent</span>
        ${(user.emailAlertsFailed > 0) ? `<span style="color:#ef4444; font-weight:bold;">❌ ${user.emailAlertsFailed} Failed</span>` : ''}
      </div>
    `;
    tr.appendChild(tdEmails);

    // 6. Role Select Dropdown
    const tdRole = document.createElement("td");
    const select = document.createElement("select");
    select.className = "role-select";
    select.id = `role-${user._id}`;

    const roles = ["viewer", "operator", "admin"];
    roles.forEach(r => {
      const option = document.createElement("option");
      option.value = r;
      option.textContent = r.charAt(0).toUpperCase() + r.slice(1);
      if (r === user.role) option.selected = true;
      select.appendChild(option);
    });
    tdRole.appendChild(select);
    tr.appendChild(tdRole);

    // 7. Security Actions
    const tdActions = document.createElement("td");

    const updateBtn = document.createElement("button");
    updateBtn.className = "action-btn btn-update";
    updateBtn.textContent = "Update";
    updateBtn.onclick = () => updateUserRole(user._id);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => deleteUser(user._id);

    tdActions.appendChild(updateBtn);
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function updateUserRole(userId) {
  const newRole = document.getElementById(`role-${userId}`).value;

  if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
    return;
  }

  try {
    const res = await fetch(`${ADMIN_API_BASE}/users/${userId}/role`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      credentials: "include",
      body: JSON.stringify({ role: newRole })
    });

    const data = await res.json();
    if (data.success) {
      alert("Role updated successfully!");
      loadUsers(); // Refresh the table immediately
    } else {
      alert(data.msg || "Failed to update role");
    }
  } catch (error) {
    console.error("Update role error:", error);
    alert("Connection error");
  }
}

async function deleteUser(userId) {
  if (!confirm("Are you SURE you want to delete this user? This cannot be undone.")) {
    return;
  }

  try {
    const res = await fetch(`${ADMIN_API_BASE}/users/${userId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
      credentials: "include"
    });

    const data = await res.json();
    if (data.success) {
      alert("User deleted successfully!");
      loadUsers(); // Refresh the table immediately
    } else {
      alert(data.msg || "Failed to delete user");
    }
  } catch (error) {
    console.error("Delete user error:", error);
    alert("Connection error");
  }
}
