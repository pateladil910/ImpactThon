// admin.js
const ADMIN_API_BASE = "/api/admin";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Immediately check if user is allowed here by fetching stats
  // If they aren't an admin, the backend will return 401 or 403.
  loadDashboardData();
});

async function loadDashboardData() {
  try {
    // Fetch Stats
    const statsRes = await fetch(`${ADMIN_API_BASE}/stats`, {
      credentials: "include" // Important for sending the auth cookie
    });

    if (statsRes.status === 401 || statsRes.status === 403) {
      // Not authorized! Kick them out immediately.
      alert("Access Denied. You are not an admin.");
      window.location.replace("index.html");
      return;
    }

    const statsData = await statsRes.json();
    if (statsData.success) {
      document.getElementById("stat-users").textContent = statsData.stats.totalUsers;
      document.getElementById("stat-detections").textContent = statsData.stats.totalDetections;
      document.getElementById("stat-incidents").textContent = statsData.stats.totalIncidents;
    }

    // Fetch Users
    loadUsers();
    
    // Fetch Contacts
    loadContacts();

  } catch (error) {
    console.error("Dashboard load error:", error);
  }
}

async function loadContacts() {
  try {
    const res = await fetch(`${ADMIN_API_BASE}/contacts`, {
      credentials: "include"
    });
    const data = await res.json();
    if (data.success) {
      renderContactsTable(data.contacts);
    }
  } catch (error) {
    console.error("Failed to load contacts:", error);
  }
}

function renderContactsTable(contacts) {
  const tbody = document.getElementById("contacts-tbody");
  tbody.innerHTML = "";
  
  if (contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No messages yet.</td></tr>';
    return;
  }

  contacts.forEach(msg => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = new Date(msg.createdAt).toLocaleString();
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
    const res = await fetch(`${ADMIN_API_BASE}/users`, {
      credentials: "include"
    });
    const data = await res.json();

    if (data.success) {
      renderUsersTable(data.users);
    }
  } catch (error) {
    console.error("Failed to load users:", error);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");

    // Name
    const tdName = document.createElement("td");
    tdName.textContent = user.name;
    tr.appendChild(tdName);

    // Email
    const tdEmail = document.createElement("td");
    tdEmail.textContent = user.email;
    tr.appendChild(tdEmail);

    // Detections
    const tdDetections = document.createElement("td");
    tdDetections.textContent = user.detectionCount || 0;
    tdDetections.style.fontWeight = "bold";
    tdDetections.style.color = "#4DE6D6";
    tr.appendChild(tdDetections);

    // Role Select
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

    // Actions
    const tdActions = document.createElement("td");

    const updateBtn = document.createElement("button");
    updateBtn.className = "action-btn btn-update";
    updateBtn.textContent = "Update Role";
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
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole })
    });

    const data = await res.json();
    if (data.success) {
      alert("Role updated successfully!");
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
      credentials: "include"
    });

    const data = await res.json();
    if (data.success) {
      alert("User deleted!");
      loadUsers(); // Refresh the table
    } else {
      alert(data.msg || "Failed to delete user");
    }
  } catch (error) {
    console.error("Delete user error:", error);
    alert("Connection error");
  }
}
