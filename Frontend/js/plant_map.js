const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://localhost:5000"
  : "https://codevortex.in";

const AI_SERVICE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
  ? "http://localhost:10000"
  : "https://impactthon-ai.onrender.com";

let cameras = [];
let activeFactory = 'Factory A';
let selectedCamera = null;
let healthInterval = null;
let telemetryInterval = null;
let audioCtx = null;
let isDragging = false;
let dragPin = null;

// ==========================================
// 1. FACTORY BLUEPRINT GENERATOR DESIGNS
// ==========================================
const factoryDesigns = {
  'Factory A': `
    <!-- Conveyor Belts -->
    <div class="production-belt" style="top: 25%; left: 10%; width: 50%; height: 25px;">
      <span>◀ CONVEYOR ASSEMBLY LINE A1 ◀</span>
    </div>
    <div class="production-belt" style="top: 65%; left: 40%; width: 50%; height: 25px;">
      <span>◀ CONVEYOR ASSEMBLY LINE A2 ◀</span>
    </div>
    
    <!-- Restricted Robotic/Machining Cells -->
    <div class="factory-zone restricted" style="top: 15%; right: 10%; width: 25%; height: 35%;">
      <span>⚠️ HEAVY MACHINERY CNC LATHES</span>
    </div>
    
    <!-- Standard Zones -->
    <div class="factory-zone" style="top: 50%; left: 5%; width: 25%; height: 35%;">
      <span>Warehouse Storage Area</span>
    </div>
    <div class="factory-zone" style="top: 10%; left: 5%; width: 20%; height: 10%;">
      <span>Operator Office</span>
    </div>
  `,
  'Factory B': `
    <!-- Conveyor Belts -->
    <div class="production-belt" style="top: 45%; left: 5%; width: 90%; height: 25px;">
      <span>◀ ROBOTIC WELDING TRANSPORT CORE ◀</span>
    </div>
    
    <!-- Restricted Zones -->
    <div class="factory-zone restricted" style="top: 10%; left: 20%; width: 60%; height: 30%;">
      <span>⚠️ ARMED ROBOT WELDING CELL (LOCKOUT REQ)</span>
    </div>
    
    <!-- Standard Zones -->
    <div class="factory-zone" style="top: 55%; left: 10%; width: 35%; height: 35%;">
      <span>Quality Testing Bay</span>
    </div>
    <div class="factory-zone" style="top: 55%; right: 10%; width: 35%; height: 35%;">
      <span>Finished Goods Shipping Dock</span>
    </div>
  `,
  'Factory C': `
    <!-- Restricted Zones -->
    <div class="factory-zone restricted" style="top: 30%; left: 35%; width: 30%; height: 40%;">
      <span>⚠️ HIGH POWER LASER CUTTERS</span>
    </div>
    
    <!-- Standard Zones -->
    <div class="factory-zone" style="top: 10%; left: 10%; width: 20%; height: 20%;">
      <span>Raw Material Storage</span>
    </div>
    <div class="factory-zone" style="top: 10%; right: 10%; width: 20%; height: 20%;">
      <span>Power Station Bay</span>
    </div>
    <div class="factory-zone" style="top: 75%; left: 5%; width: 90%; height: 15%;">
      <span>Operations Control Hub</span>
    </div>
  `
};

function isPrivateIP(urlStr) {
  if (!urlStr) return false;
  let cleanUrl = urlStr.toLowerCase().trim();
  
  // Extract host/ip
  // 1. Remove protocol schema
  cleanUrl = cleanUrl.replace(/^(rtsp|rtmp|http|https):\/\//, '');
  // 2. Remove credentials if present (anything before last '@')
  if (cleanUrl.includes('@')) {
    cleanUrl = cleanUrl.substring(cleanUrl.lastIndexOf('@') + 1);
  }
  // 3. Remove port and path (anything starting with ':' or '/')
  const endIdx = cleanUrl.search(/[:\/]/);
  if (endIdx !== -1) {
    cleanUrl = cleanUrl.substring(0, endIdx);
  }
  
  // Pure digit check (e.g. USB index "0", "1")
  if (/^\d+$/.test(cleanUrl)) return true;
  
  if (cleanUrl === 'localhost' || cleanUrl === '127.0.0.1') return true;
  if (cleanUrl.startsWith('192.168.')) return true;
  if (cleanUrl.startsWith('10.')) return true;
  
  // Match 172.16.x.x to 172.31.x.x
  const match = cleanUrl.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
  if (match) return true;
  
  return false;
}

// ==========================================
// 2. RETRIEVE CAMERA NODES & LOAD STATE
// ==========================================
async function loadCameras() {
  let cached = [];
  try {
    const saved = localStorage.getItem("safetyShieldCameras");
    if (saved) {
      cached = JSON.parse(saved);
    }
  } catch(e) {
    console.error("Error reading safetyShieldCameras", e);
  }

  // Sync from Cloud MongoDB
  try {
    const token = localStorage.getItem("token");
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/camera/all`, { headers });
    const data = await res.json();
    
    if (data.success && data.cameras) {
      const cloudCams = data.cameras;
      
      const merged = cloudCams.map((cc, i) => {
        const matchLocal = cached.find(lc => lc.cameraUrl === cc.url);
        return {
          cameraId: matchLocal ? matchLocal.cameraId : `cam_${cc._id || Date.now() + i}`,
          cameraName: cc.name || "Cloud Camera Node",
          cameraType: cc.cameraType || "IP_CAMERA",
          cameraUrl: cc.url,
          username: cc.username || "",
          password: cc.password || "",
          location: matchLocal ? matchLocal.location : "Operational Field",
          description: matchLocal ? matchLocal.description : "Synced cloud sensor feed",
          factory: cc.factory || (matchLocal ? matchLocal.factory : "Factory A"),
          mapX: cc.mapX !== undefined ? cc.mapX : (matchLocal ? matchLocal.mapX : 50),
          mapY: cc.mapY !== undefined ? cc.mapY : (matchLocal ? matchLocal.mapY : 50),
          status: "Online",
          aiStatus: "Ready",
          fps: 60.0,
          latency: 8.0,
          active: matchLocal ? matchLocal.active : (i === 0)
        };
      });

      if (merged.length > 0) {
        cameras = merged;
        localStorage.setItem("safetyShieldCameras", JSON.stringify(cameras));
      } else {
        cameras = cached;
      }
    } else {
      cameras = cached;
    }
  } catch (err) {
    console.warn("Operating in offline sandbox mapping mode.", err);
    cameras = cached;
  }

  // Ensure default fallback camera
  if (cameras.length === 0) {
    cameras = [{
      cameraId: "cam_default",
      cameraName: "Local Integrated Cam 1",
      cameraType: "WEBCAM",
      cameraUrl: "0",
      username: "",
      password: "",
      location: "Operator Bay 1",
      description: "USB fallback webcam sensor",
      factory: "Factory A",
      mapX: 45,
      mapY: 45,
      status: "Online",
      aiStatus: "Ready",
      fps: 60.0,
      latency: 8.0,
      active: true
    }];
    localStorage.setItem("safetyShieldCameras", JSON.stringify(cameras));
  }

  renderLayoutMap();
  updateTelemetryFooterStats();
}

// ==========================================
// 3. RENDER LAYOUT BLUEPRINTS AND PINS
// ==========================================
function renderLayoutMap() {
  // Update structural layout designs
  const designEl = document.getElementById("layoutFloorDesign");
  if (designEl) {
    designEl.innerHTML = factoryDesigns[activeFactory] || "";
  }

  // Render camera pins
  const pinsContainer = document.getElementById("pinsContainer");
  if (!pinsContainer) return;
  pinsContainer.innerHTML = "";

  const factoryCams = cameras.filter(c => (c.factory || 'Factory A') === activeFactory);

  factoryCams.forEach(cam => {
    const pin = document.createElement("div");
    pin.className = `camera-pin ${cam.status.toLowerCase()}`;
    pin.id = `pin_${cam.cameraId}`;
    pin.style.left = `${cam.mapX}%`;
    pin.style.top = `${cam.mapY}%`;
    
    // Save coordinate state properties
    pin.dataset.cameraId = cam.cameraId;
    pin.dataset.tempX = cam.mapX;
    pin.dataset.tempY = cam.mapY;

    if (selectedCamera && selectedCamera.cameraId === cam.cameraId) {
      pin.classList.add("active");
    }

    pin.innerHTML = `
      <div class="camera-pin-icon">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"></path>
        </svg>
      </div>
      <div class="camera-pin-label">${cam.cameraName}</div>
    `;

    // Click handler -> Selection Telemetry Inspections
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!isDragging) {
        selectCameraNode(cam);
      }
    });

    pin.addEventListener("pointerdown", onPointerDown);

    pinsContainer.appendChild(pin);
  });

  // Auto-select first camera node if none is currently selected
  if (!selectedCamera && factoryCams.length > 0) {
    selectCameraNode(factoryCams[0]);
  }
}

// ==========================================
// 4. MOUSE & TOUCH POINTER DRAG CONTROLS
// ==========================================
function onPointerDown(e) {
  e.preventDefault();
  dragPin = e.currentTarget;
  dragPin.setPointerCapture(e.pointerId);
  isDragging = false;
  
  dragPin.addEventListener("pointermove", onPointerMove);
  dragPin.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(e) {
  isDragging = true;
  const rect = document.getElementById("floorplanWrapper").getBoundingClientRect();
  
  let x = ((e.clientX - rect.left) / rect.width) * 100;
  let y = ((e.clientY - rect.top) / rect.height) * 100;

  // Constrain coordinates boundaries
  x = Math.max(0.5, Math.min(99.5, x));
  y = Math.max(0.5, Math.min(99.5, y));

  dragPin.style.left = `${x}%`;
  dragPin.style.top = `${y}%`;
  
  dragPin.dataset.tempX = x;
  dragPin.dataset.tempY = y;
}

async function onPointerUp(e) {
  if (dragPin) {
    dragPin.releasePointerCapture(e.pointerId);
    dragPin.removeEventListener("pointermove", onPointerMove);
    dragPin.removeEventListener("pointerup", onPointerUp);

    if (isDragging) {
      const camId = dragPin.dataset.cameraId;
      const x = parseFloat(dragPin.dataset.tempX);
      const y = parseFloat(dragPin.dataset.tempY);

      // Save coords immediately in cache and DB
      await saveNodeCoordinates(camId, x, y);
    }
    
    // Tiny delay to prevent click fire right after dragging release
    setTimeout(() => { isDragging = false; }, 80);
    dragPin = null;
  }
}

async function saveNodeCoordinates(cameraId, mapX, mapY) {
  const cam = cameras.find(c => c.cameraId === cameraId);
  if (!cam) return;

  cam.mapX = Number(mapX.toFixed(2));
  cam.mapY = Number(mapY.toFixed(2));
  localStorage.setItem("safetyShieldCameras", JSON.stringify(cameras));

  // Sync to database
  try {
    const token = localStorage.getItem("token");
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/camera/update_coordinates`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        url: cam.cameraUrl,
        mapX: cam.mapX,
        mapY: cam.mapY
      })
    });
    
    const data = await res.json();
    if (data.success) {
      console.log(`Successfully persisted coordinates: x=${cam.mapX}%, y=${cam.mapY}%`);
    }
  } catch (err) {
    console.warn("Database coordinate synchronization failed. Operating locally.", err);
  }
}

// Double click maps to quick placement/creation onboarding
function handleMapDoubleClick(e) {
  // Prevent double click on child pins triggering setup
  if (e.target !== e.currentTarget && !e.target.classList.contains("blueprint-grid-overlay") && !e.target.classList.contains("layout-floor-design")) {
    return;
  }

  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  // Save transient blueprint coordinates to direct the camera setup page
  localStorage.setItem("transientMapFactory", activeFactory);
  localStorage.setItem("transientMapX", x.toFixed(1));
  localStorage.setItem("transientMapY", y.toFixed(1));

  if (confirm(`Onboard new sensor node at layout coordinates [X: ${x.toFixed(1)}%, Y: ${y.toFixed(1)}%] inside ${activeFactory}?`)) {
    location.href = "camera_setup.html";
  }
}

// ==========================================
// 5. INSPECT TELEMETRY POPULATOR
// ==========================================
function selectCameraNode(cam) {
  selectedCamera = cam;
  
  // Highlight active pin
  document.querySelectorAll(".camera-pin").forEach(p => p.classList.remove("active"));
  const activePin = document.getElementById(`pin_${cam.cameraId}`);
  if (activePin) activePin.classList.add("active");

  // Populate info panel attributes
  document.getElementById("inspectName").textContent = cam.cameraName;
  document.getElementById("inspectLocation").textContent = `📍 ${cam.location}`;
  document.getElementById("inspectType").textContent = cam.cameraType;
  
  const statusEl = document.getElementById("inspectStatus");
  statusEl.textContent = cam.status;
  statusEl.style.color = cam.status === "Online" ? "var(--safe-green)" : "var(--danger-red)";

  document.getElementById("inspectLatency").textContent = cam.status === "Online" ? `${cam.latency.toFixed(1)}ms` : "N/A";
  document.getElementById("inspectDesc").textContent = cam.description || "No notes configured.";

  // Connect live preview feed
  const previewImg = document.getElementById("inspectorMiniFeed");
  const placeholder = document.getElementById("inspectorPlaceholder");
  
  if (previewImg && placeholder) {
    if (cam.status === "Online") {
      previewImg.removeAttribute("src");
      const isLocal = isPrivateIP(cam.cameraUrl);
      const testUrl = isLocal ? "http://localhost:5000" : AI_SERVICE_URL;

      previewImg.src = `${testUrl}/video_feed?source=${encodeURIComponent(cam.cameraUrl)}&username=${encodeURIComponent(cam.username)}&password=${encodeURIComponent(cam.password)}`;
      previewImg.style.display = "block";
      placeholder.style.display = "none";
    } else {
      previewImg.style.display = "none";
      placeholder.style.display = "flex";
      placeholder.innerHTML = `
        <svg width="24" height="24" fill="none" stroke="var(--danger-red)" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span style="color: var(--danger-red);">SENSOR DISCONNECTED: Feeds unavailable. Verify node power and connections.</span>
      `;
    }
  }
}

function inspectGoToDashboard() {
  if (selectedCamera) {
    // Set active in localStorage and redirect
    cameras.forEach(c => c.active = false);
    const target = cameras.find(c => c.cameraId === selectedCamera.cameraId);
    if (target) target.active = true;
    localStorage.setItem("safetyShieldCameras", JSON.stringify(cameras));
  }
  location.href = "dashboard.html";
}

// ==========================================
// 6. SWAPPING FACTORY CONTROL PANEL
// ==========================================
function switchFactory(factoryName) {
  activeFactory = factoryName;
  
  // Highlight Tab
  document.querySelectorAll(".factory-tab").forEach(tab => {
    if (tab.textContent.trim().toUpperCase() === factoryName.toUpperCase()) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Reset inspector views
  selectedCamera = null;
  document.getElementById("inspectName").textContent = "--";
  document.getElementById("inspectLocation").textContent = "--";
  document.getElementById("inspectType").textContent = "--";
  document.getElementById("inspectStatus").textContent = "--";
  document.getElementById("inspectStatus").style.color = "var(--text-muted)";
  document.getElementById("inspectLatency").textContent = "--";
  document.getElementById("inspectDesc").textContent = "--";
  
  const previewImg = document.getElementById("inspectorMiniFeed");
  const placeholder = document.getElementById("inspectorPlaceholder");
  if (previewImg) previewImg.style.display = "none";
  if (placeholder) placeholder.style.display = "flex";

  renderLayoutMap();
  updateTelemetryFooterStats();
}

function updateTelemetryFooterStats() {
  const factoryCams = cameras.filter(c => (c.factory || 'Factory A') === activeFactory);
  
  if (document.getElementById("footer-active-factory")) {
    document.getElementById("footer-active-factory").textContent = activeFactory.toUpperCase();
  }
  if (document.getElementById("footer-total-pins")) {
    document.getElementById("footer-total-pins").textContent = factoryCams.length;
  }
}

// ==========================================
// 7. REAL-TIME THREAT & HEALTH SWEEPS
// ==========================================
async function updateCameraStatusInDB(url, status) {
  try {
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_BASE_URL}/api/camera/update_status`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ url, status })
    });
  } catch (err) {
    console.error("Failed to persist camera status update:", err);
  }
}

function startTelemetrySweeps() {
  // Check sensor online statuses (every 5 seconds)
  healthInterval = setInterval(async () => {
    for (let i = 0; i < cameras.length; i++) {
      const cam = cameras[i];
      const isLocal = isPrivateIP(cam.cameraUrl);
      const checkUrl = isLocal ? "http://localhost:5000/status" : `${AI_SERVICE_URL}/status`;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // Fast timeout
        
        const res = await fetch(checkUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.status === 200) {
          if (cam.status !== "Online") {
            cam.status = "Online";
            updateCameraStatusInDB(cam.cameraUrl, "Online");
          }
        } else {
          if (cam.status !== "Offline") {
            cam.status = "Offline";
            updateCameraStatusInDB(cam.cameraUrl, "Offline");
          }
        }
      } catch(e) {
        if (cam.status !== "Offline") {
          cam.status = "Offline";
          updateCameraStatusInDB(cam.cameraUrl, "Offline");
        }
      }
    }
    renderLayoutMap();
  }, 5000);

  // Monitor threat breaches (every 1 second)
  let lastBreached = false;
  telemetryInterval = setInterval(async () => {
    let globalThreatActive = false;

    for (let i = 0; i < cameras.length; i++) {
      const cam = cameras[i];
      if (cam.status !== "Online") continue;

      const isLocal = isPrivateIP(cam.cameraUrl);
      const checkUrl = isLocal ? "http://localhost:5000/status" : `${AI_SERVICE_URL}/status`;

      try {
        const res = await fetch(checkUrl, { cache: "no-store" });
        const data = await res.json();
        
        const pinEl = document.getElementById(`pin_${cam.cameraId}`);
        
        if (data.safety === "DANGER") {
          globalThreatActive = true;
          if (pinEl) {
            pinEl.classList.add("breach");
            pinEl.classList.remove("online", "offline");
          }
          
          // Update details if currently selected
          if (selectedCamera && selectedCamera.cameraId === cam.cameraId) {
            document.getElementById("inspectStatus").textContent = "CRITICAL BREACH";
            document.getElementById("inspectStatus").style.color = "var(--danger-red)";
          }
        } else {
          if (pinEl) {
            pinEl.classList.remove("breach");
            pinEl.classList.add("online");
          }
          if (selectedCamera && selectedCamera.cameraId === cam.cameraId) {
            document.getElementById("inspectStatus").textContent = "Online";
            document.getElementById("inspectStatus").style.color = "var(--safe-green)";
          }
        }

        // Keep Latency synced
        if (data.camera) {
          cam.latency = 6.0 + Math.random() * 4.0;
          if (selectedCamera && selectedCamera.cameraId === cam.cameraId) {
            document.getElementById("inspectLatency").textContent = `${cam.latency.toFixed(1)}ms`;
          }
        }

      } catch (err) {}
    }

    // Play Warning siren beep if danger states toggle
    if (globalThreatActive) {
      playSirenTone();
    }
  }, 1000);
}

function playSirenTone() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (e) {}
}

// ==========================================
// 8. PAGE INITIATOR ON LOAD
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Read transient coords (if onboarding map placement redirected us here)
  const transientFactory = localStorage.getItem("transientMapFactory");
  if (transientFactory) {
    activeFactory = transientFactory;
    localStorage.removeItem("transientMapFactory");
    
    // Clear other positioning hints
    localStorage.removeItem("transientMapX");
    localStorage.removeItem("transientMapY");
  }

  loadCameras();
  startTelemetrySweeps();
});
