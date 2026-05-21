const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://localhost:5000"
  : "https://impactthon-wjut.onrender.com";
const API_BASE = `${API_BASE_URL}/api/incident`;
let allIncidents = [];
let filteredIncidents = [];

// Pagination state
let currentPage = 1;
const itemsPerPage = 8;

// Fallback high-fidelity mock data if database is empty or connection fails
const fallbackIncidents = [
  {
    _id: "mock-1",
    type: "Zone Breach - Human Near Gear",
    confidence: 96.8,
    camera: "Camera Node 1",
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString() // 12 mins ago
  },
  {
    _id: "mock-2",
    type: "PPE Compliance - No Helmet Detected",
    confidence: 88.4,
    camera: "Camera Node 2",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() // 45 mins ago
  },
  {
    _id: "mock-3",
    type: "Camera Connection Offline",
    confidence: 100.0,
    camera: "Camera Node 2",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString() // 2 hours ago
  },
  {
    _id: "mock-4",
    type: "PPE Compliance - No Vest Detected",
    confidence: 79.2,
    camera: "Camera Node 1",
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString() // 3 hours ago
  },
  {
    _id: "mock-5",
    type: "Zone Breach - Human Near Gear",
    confidence: 94.1,
    camera: "USB Test Input",
    createdAt: new Date(Date.now() - 1000 * 60 * 300).toISOString() // 5 hours ago
  },
  {
    _id: "mock-6",
    type: "Emergency PLC Contactor Override",
    confidence: 100.0,
    camera: "Camera Node 1",
    createdAt: new Date(Date.now() - 1000 * 60 * 420).toISOString() // 7 hours ago
  },
  {
    _id: "mock-7",
    type: "PPE Compliance - No Helmet Detected",
    confidence: 82.5,
    camera: "Camera Node 2",
    createdAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString() // 1 day ago
  },
  {
    _id: "mock-8",
    type: "Zone Breach - Human Near Gear",
    confidence: 91.3,
    camera: "Camera Node 1",
    createdAt: new Date(Date.now() - 1000 * 60 * 1600).toISOString() // 1.1 days ago
  },
  {
    _id: "mock-9",
    type: "Camera Connection Offline",
    confidence: 100.0,
    camera: "USB Test Input",
    createdAt: new Date(Date.now() - 1000 * 60 * 2800).toISOString() // 2 days ago
  }
];

document.addEventListener("DOMContentLoaded", () => {
  // Check auth user session HUD details
  checkAuthUI();
  
  // Load safety log data
  fetchIncidents();
});

// Helper to determine severity level based on incident type
function getIncidentSeverity(incident) {
  const type = incident.type.toLowerCase();
  if (type.includes("offline") || type.includes("connection") || type.includes("override") || type.includes("bypass") || type.includes("system")) {
    return "system";
  }
  if (type.includes("breach") || type.includes("incursion") || type.includes("danger") || type.includes("human")) {
    return "critical";
  }
  return "warning";
}

// Fetch Incidents from Database API
async function fetchIncidents() {
  const tbody = document.getElementById("incidents-tbody");
  
  try {
    const res = await fetch(`${API_BASE}/all`, {
      credentials: "include"
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // If DB has records, use them, otherwise fallback to premium mock records
      if (data && data.length > 0) {
        allIncidents = data;
      } else {
        console.log("Database has no logged incidents. Initializing high-fidelity fallbacks.");
        allIncidents = [...fallbackIncidents];
      }
    } else {
      console.warn("Failed to reach active API endpoints. Loading telemetry fallback profiles.");
      allIncidents = [...fallbackIncidents];
    }
  } catch (err) {
    console.error("Uplink Connection Interrupted:", err);
    allIncidents = [...fallbackIncidents];
  }

  // Pre-fill metrics count cards
  calculateSeverityCounts();
  
  // Apply initial filters & render
  filterIncidents();
}

// Calculate the metric cards numbers dynamically
function calculateSeverityCounts() {
  let critical = 0;
  let warning = 0;
  let system = 0;

  allIncidents.forEach(inc => {
    const sev = getIncidentSeverity(inc);
    if (sev === "critical") critical++;
    else if (sev === "warning") warning++;
    else if (sev === "system") system++;
  });

  // Animating values using incremental steps for dynamic UI feel
  animateCounter("critical-count", critical);
  animateCounter("warning-count", warning);
  animateCounter("system-count", system);
}

// Counter animation logic
function animateCounter(id, targetValue) {
  const el = document.getElementById(id);
  if (!el) return;

  let current = 0;
  const duration = 600; // ms
  const stepTime = Math.max(Math.floor(duration / (targetValue || 1)), 15);
  
  const timer = setInterval(() => {
    if (current >= targetValue) {
      el.textContent = targetValue;
      clearInterval(timer);
    } else {
      current++;
      el.textContent = current;
    }
  }, stepTime);
}

// Apply searches and selections from filters
function filterIncidents() {
  const searchVal = document.getElementById("search-type").value.toLowerCase();
  const camVal = document.getElementById("filter-camera").value;
  const sevVal = document.getElementById("filter-severity").value;

  filteredIncidents = allIncidents.filter(inc => {
    // 1. Filter Type Search
    const matchesSearch = inc.type.toLowerCase().includes(searchVal);
    
    // 2. Filter Camera Sector
    const matchesCamera = camVal === "all" || inc.camera === camVal;

    // 3. Filter Severity Level
    const sev = getIncidentSeverity(inc);
    const matchesSeverity = sevVal === "all" || sev === sevVal;

    return matchesSearch && matchesCamera && matchesSeverity;
  });

  // Reset pagination to first page when filtering changes
  currentPage = 1;
  renderTable();
}

// Render incident log rows inside the responsive container
function renderTable() {
  const tbody = document.getElementById("incidents-tbody");
  tbody.innerHTML = "";

  if (filteredIncidents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 0; color: var(--text-muted);">
          No safety incident records found matching the current queries.
        </td>
      </tr>
    `;
    updatePaginationControls(0);
    return;
  }

  // Calculate slice parameters
  const total = filteredIncidents.length;
  const totalPages = Math.ceil(total / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, total);

  const paginatedList = filteredIncidents.slice(startIdx, endIdx);

  paginatedList.forEach(inc => {
    const tr = document.createElement("tr");
    tr.className = "table-hover-row";
    
    // Severity styling parameters
    const sev = getIncidentSeverity(inc);
    let severityClass = "status-warning";
    let severityLabel = "⚠️ Warning";
    
    if (sev === "critical") {
      severityClass = "status-critical";
      severityLabel = "🚨 Critical";
    } else if (sev === "system") {
      severityClass = "status-system";
      severityLabel = "⚙️ System";
    }

    // Acknowledgment select status saved in localStorage to sustain page refreshes
    const savedAck = localStorage.getItem(`incident-ack-${inc._id}`) || "unresolved";

    // Build row columns
    // Timestamp
    const tdTime = document.createElement("td");
    const dateObj = new Date(inc.createdAt);
    tdTime.innerHTML = `<span class="time-main">${dateObj.toLocaleTimeString()}</span><span class="time-sub">${dateObj.toLocaleDateString()}</span>`;
    tr.appendChild(tdTime);

    // Camera Node IP
    const tdCam = document.createElement("td");
    tdCam.className = "code-font";
    tdCam.textContent = inc.camera || "Unknown Sector";
    tr.appendChild(tdCam);

    // Metric Type
    const tdType = document.createElement("td");
    tdType.style.fontWeight = "600";
    tdType.textContent = inc.type;
    tr.appendChild(tdType);

    // Confidence score
    const tdConf = document.createElement("td");
    const confVal = typeof inc.confidence === "number" ? inc.confidence.toFixed(1) : parseFloat(inc.confidence || 0).toFixed(1);
    tdConf.innerHTML = `<span class="confidence-val" style="color: ${confVal > 85 ? 'var(--primary-neon)' : 'var(--text-main)'};">${confVal}%</span>`;
    tr.appendChild(tdConf);

    // Severity
    const tdSeverity = document.createElement("td");
    tdSeverity.innerHTML = `<span class="table-badge ${severityClass}">${severityLabel}</span>`;
    tr.appendChild(tdSeverity);

    // Action Acknowledgment Dropdown Selector
    const tdAck = document.createElement("td");
    
    const select = document.createElement("select");
    select.className = `ack-selector ack-state-${savedAck}`;
    select.innerHTML = `
      <option value="unresolved" ${savedAck === 'unresolved' ? 'selected' : ''}>🔴 Unresolved</option>
      <option value="investigating" ${savedAck === 'investigating' ? 'selected' : ''}>🟡 Investigating</option>
      <option value="resolved" ${savedAck === 'resolved' ? 'selected' : ''}>🟢 Resolved</option>
    `;
    
    select.addEventListener("change", (e) => {
      const newStatus = e.target.value;
      
      // Store in localStorage
      localStorage.setItem(`incident-ack-${inc._id}`, newStatus);
      
      // Update element classes to match color profile
      select.className = `ack-selector ack-state-${newStatus}`;
      
      // Print console confirmation
      console.log(`[AUDIT COMPLIANCE]: Incident ${inc._id} state shifted to [${newStatus.toUpperCase()}]`);
    });

    tdAck.appendChild(select);
    tr.appendChild(tdAck);

    tbody.appendChild(tr);
  });

  // Update Pagination Controls HUD
  updatePaginationControls(total);
}

// Refresh Page counts & disable states
function updatePaginationControls(totalRecords) {
  const totalPages = Math.ceil(totalRecords / itemsPerPage) || 1;
  const startVal = totalRecords === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endVal = Math.min(currentPage * itemsPerPage, totalRecords);

  document.getElementById("pagination-text").textContent = `Showing ${startVal} - ${endVal} of ${totalRecords} records`;

  document.getElementById("btn-prev").disabled = currentPage === 1;
  document.getElementById("btn-next").disabled = currentPage === totalPages || totalRecords === 0;
}

// Prev and Next controllers
function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
}

// CSV compilation & export protocol
function exportCSV() {
  if (filteredIncidents.length === 0) {
    alert("No active query logs to export.");
    return;
  }

  console.log(`[COMPLIANCE LOGS]: Triggering secure CSV compilation core...`);
  
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // CSV Headers
  csvContent += "Record ID,Timestamp (UTC),Camera sector,Threat type,Confidence level (%),Severity,Operator Acknowledgment\r\n";

  filteredIncidents.forEach(inc => {
    const timeStr = new Date(inc.createdAt).toISOString();
    const cleanType = inc.type.replace(/,/g, ";"); // prevent breaking CSV cells
    const cleanCam = inc.camera.replace(/,/g, ";");
    const sev = getIncidentSeverity(inc).toUpperCase();
    const ack = localStorage.getItem(`incident-ack-${inc._id}`) || "UNRESOLVED";
    
    const row = `"${inc._id}","${timeStr}","${cleanCam}","${cleanType}","${inc.confidence}","${sev}","${ack.toUpperCase()}"`;
    csvContent += row + "\r\n";
  });

  // Create temporary downloadable hyperlink
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  
  const timestamp = new Date().toISOString().substring(0,10);
  link.setAttribute("download", `ai_safety_shield_audit_${timestamp}.csv`);
  document.body.appendChild(link); // Required for FF
  
  link.click();
  document.body.removeChild(link);
  
  console.log(`[COMPLIANCE LOGS]: CSV audit export successful.`);
}

// Modal open/close helpers
function openSimModal() {
  document.getElementById("sim-modal").style.display = "flex";
}

function closeSimModal() {
  document.getElementById("sim-modal").style.display = "none";
}

// Submit simulated hazard event
async function submitSimulation(event) {
  event.preventDefault();

  const type = document.getElementById("sim-type").value;
  const camera = document.getElementById("sim-camera").value;
  const confidence = parseFloat(document.getElementById("sim-confidence").value || 92);

  const payload = {
    type,
    camera,
    confidence
  };

  try {
    const res = await fetch(`${API_BASE}/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log("[AUDIT SIMULATION]: Safety trigger logged on server.");
      alert("Incursion Breach dispatched and compiled successfully!");
    } else {
      console.warn("[AUDIT SIMULATION]: Direct DB insertion bypassed. Injecting local HUD telemetry client-side.");
      // Inject locally so user immediately sees results even if offline/disconnected
      const localId = `sim-local-${Math.floor(Math.random() * 10000)}`;
      allIncidents.unshift({
        _id: localId,
        type,
        camera,
        confidence,
        createdAt: new Date().toISOString()
      });
      alert("Incursion breach simulation compiled locally!");
    }
  } catch (err) {
    console.error("[AUDIT SIMULATION] Connection failed:", err);
    // Inject locally as backup
    const localId = `sim-local-${Math.floor(Math.random() * 10000)}`;
    allIncidents.unshift({
      _id: localId,
      type,
      camera,
      confidence,
      createdAt: new Date().toISOString()
    });
    alert("Incursion breach simulation compiled locally!");
  }

  // Close modal, recount, filter, and render
  closeSimModal();
  calculateSeverityCounts();
  filterIncidents();
}
