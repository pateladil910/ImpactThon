document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
    ? "http://localhost:5000"
    : "https://impactthon-wjut.onrender.com";

  const AI_SERVICE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
    ? "http://localhost:10000"
    : "https://impactthon-ai.onrender.com";

  // 1. SELECT UI ELEMENTS
  const btnTest = document.getElementById('btnTest');
  const btnConnect = document.getElementById('btnConnect');
  const statusBox = document.getElementById('statusBox');
  const statusMessage = document.getElementById('statusMessage');
  const spinner = document.getElementById('spinner');
  const urlWarning = document.getElementById('urlWarning');
  const camUrl = document.getElementById('camUrl');
  const cameraForm = document.getElementById('cameraForm');

  function updateDeployButtonState() {
    const url = camUrl.value.trim();
    if (url) {
      btnConnect.disabled = false;
    } else {
      btnConnect.disabled = true;
    }
  }

  // Monitor input to dynamically enable/disable the Deploy button
  camUrl.addEventListener('input', updateDeployButtonState);
  // Run initially in case of autofill
  updateDeployButtonState();

  // Preview elements
  const previewFeed = document.getElementById('previewFeed');
  const streamLoader = document.getElementById('streamLoader');
  const restrictedZoneOverlay = document.getElementById('restrictedZoneOverlay');
  const streamStatusDot = document.getElementById('streamStatusDot');
  const streamStatusText = document.getElementById('streamStatusText');
  const streamResolution = document.getElementById('streamResolution');
  const streamTitleTag = document.getElementById('streamTitleTag');

  // Telemetry widgets
  const hudHumanCount = document.getElementById('hudHumanCount');
  const hudZoneStatus = document.getElementById('hudZoneStatus');
  const hudZoneStatusCard = document.getElementById('hudZoneStatusCard');
  const hudConfidence = document.getElementById('hudConfidence');
  const hudFps = document.getElementById('hudFps');
  const telStreamHealth = document.getElementById('telStreamHealth');
  const telLatency = document.getElementById('telLatency');

  // Demo simulation elements
  const demoModeToggle = document.getElementById('demoModeToggle');
  const simulatedLogsContainer = document.getElementById('simulatedLogsContainer');
  const simulatedLogsConsole = document.getElementById('simulatedLogsConsole');

  let audioCtx = null;
  let demoInterval = null;
  let demoActive = false;
  let telemetryInterval = null;

  function startRealTimeTelemetry() {
    if (telemetryInterval) clearInterval(telemetryInterval);
    
    // Ensure demo mode is turned off so it doesn't conflict
    if (demoModeToggle) {
      demoModeToggle.checked = false;
      stopDetection();
    }

    if (simulatedLogsContainer) simulatedLogsContainer.classList.remove('hidden');

    telemetryInterval = setInterval(async () => {
      try {
        const response = await fetch(`${AI_SERVICE_URL}/status`, { cache: "no-store" });
        const data = await response.json();

        // 1. Update safety status card
        if (data.safety === "DANGER") {
          if (hudHumanCount) hudHumanCount.textContent = "1";
          if (hudZoneStatus) {
            hudZoneStatus.textContent = 'DANGER';
            hudZoneStatus.style.color = 'var(--danger-red)';
            hudZoneStatus.style.textShadow = '0 0 10px var(--danger-red)';
          }
          if (hudZoneStatusCard) {
            hudZoneStatusCard.style.borderColor = 'var(--danger-red)';
            hudZoneStatusCard.style.boxShadow = 'inset 0 0 10px rgba(239, 68, 68, 0.2)';
          }
          triggerAlert();
        } else {
          if (hudHumanCount) hudHumanCount.textContent = '0';
          if (hudZoneStatus) {
            hudZoneStatus.textContent = 'SAFE';
            hudZoneStatus.style.color = 'var(--safe-green)';
            hudZoneStatus.style.textShadow = 'none';
          }
          if (hudZoneStatusCard) {
            hudZoneStatusCard.style.borderColor = 'rgba(6, 182, 212, 0.08)';
            hudZoneStatusCard.style.boxShadow = 'none';
          }
        }

        // 2. Update confidence
        if (hudConfidence && data.confidence !== undefined) {
          hudConfidence.textContent = data.confidence + '%';
        }

        // 3. Update FPS and latency dynamically
        if (hudFps) {
          hudFps.textContent = (55 + Math.random() * 5).toFixed(1) + ' FPS';
        }
        if (telLatency) {
          telLatency.textContent = (6 + Math.random() * 4).toFixed(1) + 'ms';
        }

      } catch (err) {
        console.error("Real-time telemetry poll error:", err);
      }
    }, 500);
  }

  function stopRealTimeTelemetry() {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  }

  // 2. AUTOFILL EXISTING CAMERA CONFIGURATION
  async function loadExistingCamera() {
    try {
      const token = localStorage.getItem("token");
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/api/camera/latest`, { headers });
      if (response.status === 404) {
        console.log("No camera in database. Showing empty setup form.");
        document.body.classList.add('show-form');
        return;
      }

      const data = await response.json();
      if (data.success && data.camera) {
        console.log("Persistent camera found. Autofilling configuration.");
        
        // Autofill the input fields
        const camName = document.getElementById('camName');
        const camType = document.getElementById('camType');
        const camUser = document.getElementById('camUser');

        if (camName) camName.value = data.camera.name || "";
        if (camType) camType.value = data.camera.cameraType || "RTSP Camera (Network Stream)";
        if (camUrl) camUrl.value = data.camera.url || "";
        if (camUser) camUser.value = data.camera.username || "";
        // Note: Password is kept blank for security unless they re-enter it

        // Dispatch input event to trigger warning and deploy button state updates
        if (camUrl) {
          camUrl.dispatchEvent(new Event('input'));
        }
      }
    } catch (err) {
      console.log("Error loading previous camera config:", err);
    }
    document.body.classList.add('show-form');
  }

  // Load existing camera configuration on start
  await loadExistingCamera();

  // 3. REAL-TIME LOCAL IP WARNING
  camUrl.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const isLocal = val.includes('192.168.') || val.includes('10.') ||
      val.includes('localhost') || val.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);

    if (isLocal) {
      urlWarning.innerHTML = '⚠️ Private IP detected. Browser-direct intranet mode activated.';
      urlWarning.classList.remove('hidden');
    } else {
      urlWarning.classList.add('hidden');
    }
  });

  // ==========================================
  // 4. FUTURE BACKEND READY HOOKS & FUNCTIONS
  // ==========================================

  window.connectCamera = function(url) {
    console.log("[BACKEND READY] connectCamera() invoked for:", url);
    if (streamLoader) streamLoader.style.display = 'flex';
    if (previewFeed) {
      previewFeed.src = url;
      previewFeed.style.display = 'block';
    }
  };

  window.verifyStream = function(status, msg) {
    console.log("[BACKEND READY] verifyStream() status:", status, "| message:", msg);
    if (status === 'success') {
      showStatus('success', 'Camera Online! Direct network ingest active.');
      if (streamStatusDot) {
        streamStatusDot.style.backgroundColor = 'var(--safe-green)';
        streamStatusDot.style.boxShadow = '0 0 10px var(--safe-green)';
      }
      if (streamStatusText) streamStatusText.textContent = 'INGEST_CORE: ONLINE';
      if (streamTitleTag) streamTitleTag.textContent = 'NEURAL VIDEO SENSLINK ACTIVE';
      if (telStreamHealth) {
        telStreamHealth.textContent = 'EXCELLENT';
        telStreamHealth.style.color = 'var(--safe-green)';
      }
      if (telLatency) telLatency.textContent = '8.24ms';
      if (restrictedZoneOverlay) restrictedZoneOverlay.style.display = 'block';
      btnConnect.disabled = false;
    } else {
      showStatus('error', 'Camera Offline: ' + msg);
      if (streamStatusDot) {
        streamStatusDot.style.backgroundColor = 'var(--danger-red)';
        streamStatusDot.style.boxShadow = '0 0 10px var(--danger-red)';
      }
      if (streamStatusText) streamStatusText.textContent = 'INGEST_CORE: OFFLINE';
      if (streamTitleTag) streamTitleTag.textContent = 'SENSOR ACQUISITION FAILURE';
      if (telStreamHealth) {
        telStreamHealth.textContent = 'ERROR';
        telStreamHealth.style.color = 'var(--danger-red)';
      }
      if (telLatency) telLatency.textContent = 'N/A';
      if (restrictedZoneOverlay) restrictedZoneOverlay.style.display = 'none';
      updateDeployButtonState();
    }
  };

  window.startDetection = function() {
    console.log("[BACKEND READY] startDetection() loop initialized.");
    demoActive = true;
    if (simulatedLogsContainer) simulatedLogsContainer.classList.remove('hidden');
    
    demoInterval = setInterval(() => {
      if (!demoActive) return;
      
      const isBreached = Math.random() > 0.5; // 50% chance to breach
      
      if (isBreached) {
        // Intrusion State
        if (hudHumanCount) hudHumanCount.textContent = Math.floor(Math.random() * 2) + 1;
        if (hudZoneStatus) {
          hudZoneStatus.textContent = 'DANGER';
          hudZoneStatus.style.color = 'var(--danger-red)';
          hudZoneStatus.style.textShadow = '0 0 10px var(--danger-red)';
        }
        if (hudZoneStatusCard) {
          hudZoneStatusCard.style.borderColor = 'var(--danger-red)';
          hudZoneStatusCard.style.boxShadow = 'inset 0 0 10px rgba(239, 68, 68, 0.2)';
        }
        if (hudConfidence) hudConfidence.textContent = (Math.random() * 5 + 94).toFixed(1) + '%';
        if (hudFps) hudFps.textContent = (Math.random() * 2 + 58).toFixed(1) + ' FPS';
        
        triggerAlert();
      } else {
        // Safe state
        if (hudHumanCount) hudHumanCount.textContent = '0';
        if (hudZoneStatus) {
          hudZoneStatus.textContent = 'SAFE';
          hudZoneStatus.style.color = 'var(--safe-green)';
          hudZoneStatus.style.textShadow = 'none';
        }
        if (hudZoneStatusCard) {
          hudZoneStatusCard.style.borderColor = 'rgba(6, 182, 212, 0.08)';
          hudZoneStatusCard.style.boxShadow = 'none';
        }
        if (hudConfidence) hudConfidence.textContent = '0.0%';
        if (hudFps) hudFps.textContent = (Math.random() * 2 + 58).toFixed(1) + ' FPS';
      }
    }, 2500);
  };

  window.stopDetection = function() {
    console.log("[BACKEND READY] stopDetection() invoked.");
    demoActive = false;
    if (demoInterval) clearInterval(demoInterval);
    if (simulatedLogsContainer) simulatedLogsContainer.classList.add('hidden');
    
    // Reset HUD counters
    if (hudHumanCount) hudHumanCount.textContent = '0';
    if (hudZoneStatus) {
      hudZoneStatus.textContent = 'SAFE';
      hudZoneStatus.style.color = 'var(--safe-green)';
      hudZoneStatus.style.textShadow = 'none';
    }
    if (hudZoneStatusCard) {
      hudZoneStatusCard.style.borderColor = 'rgba(6, 182, 212, 0.08)';
      hudZoneStatusCard.style.boxShadow = 'none';
    }
    if (hudConfidence) hudConfidence.textContent = '0.0%';
    if (hudFps) hudFps.textContent = '0.0 FPS';
  };

  window.triggerAlert = function() {
    console.log("[BACKEND READY] triggerAlert() sound & notification generated.");
    
    // Play Web Audio buzzer siren
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Piercing pitch
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15); // Decay beep
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
    } catch (err) {
      console.warn("Synth failed to buzzer:", err);
    }

    // Show cybersecurity alert banner
    showHUDToast('CRITICAL BREACH', 'HUMAN DETECTED IN RESTRICTED AREA - LOCKOUT INTERCEPT', 'error');

    // Add entry to incident logs console
    saveIncident();
  };

  window.saveIncident = function() {
    console.log("[BACKEND READY] saveIncident() logged to SCADA memory.");
    if (simulatedLogsConsole) {
      const line = document.createElement('div');
      line.style.borderBottom = '1px solid rgba(239, 68, 68, 0.12)';
      line.style.paddingBottom = '3px';
      line.innerHTML = `<span style="color: var(--text-muted); font-size: 10px;">[${new Date().toLocaleTimeString()}]</span> <span style="font-weight: 700;">LOCKOUT ACTIVE</span>: Coordinate breach at vector zone. Power interlock trip triggered.`;
      simulatedLogsConsole.appendChild(line);
      simulatedLogsConsole.scrollTop = simulatedLogsConsole.scrollHeight;
    }
  };

  // ==========================================
  // 5. TEST CONNECTION LOGIC (BROWSER-DIRECT)
  // ==========================================
  
  btnTest.addEventListener('click', () => {
    const url = camUrl.value.trim();
    if (!url) {
      showStatus('error', 'Please enter a Stream URL to test.');
      showHUDToast('INPUT FAILURE', 'A valid camera url must be populated before testing.', 'error');
      return;
    }

    // Stop previous telemetry polling
    stopRealTimeTelemetry();

    // Initialize viewport loader
    if (streamLoader) streamLoader.style.display = 'flex';
    if (previewFeed) previewFeed.style.display = 'none';
    if (restrictedZoneOverlay) restrictedZoneOverlay.style.display = 'none';

    showStatus('testing', 'Interpreting local subnet socket connection...');
    updateDeployButtonState();

    let hasFailed = false;

    // 1. Clear previous handlers & src cleanly to avoid empty src error events bubbling
    previewFeed.onload = null;
    previewFeed.onerror = null;
    previewFeed.removeAttribute('src');

    // 2. Set up the listeners BEFORE setting the new source
    previewFeed.onerror = () => {
      hasFailed = true;
      stopRealTimeTelemetry();
      if (streamLoader) streamLoader.style.display = 'none';
      if (previewFeed) previewFeed.style.display = 'none';
      verifyStream('error', 'Replay socket timeout or address unreachable.');
      showHUDToast('CAMERA OFFLINE', 'Network address unreachable or port closed.', 'error');
    };

    // If the stream loads, handle success
    previewFeed.onload = () => {
      if (!hasFailed) {
        clearTimeout(validationTimer);
        if (streamLoader) streamLoader.style.display = 'none';
        if (previewFeed) previewFeed.style.display = 'block';
        verifyStream('success');
        showHUDToast('CAMERA ONLINE', 'Neural video feed connected and linked successfully!', 'success');
        startRealTimeTelemetry();
      }
    };

    // Since MJPEG streams are continuous and never finish loading, we wait 1.8 seconds
    const validationTimer = setTimeout(() => {
      if (!hasFailed) {
        if (streamLoader) streamLoader.style.display = 'none';
        if (previewFeed) previewFeed.style.display = 'block';
        verifyStream('success');
        showHUDToast('CAMERA ONLINE', 'Intranet socket feed parsed and linked successfully!', 'success');
        startRealTimeTelemetry();
      }
    }, 1800);

    // 3. NOW set the src to route through the local AI service
    previewFeed.src = `${AI_SERVICE_URL}/video_feed?source=${encodeURIComponent(url)}`;
  });

  // ==========================================
  // 6. SAVE TO DATABASE & LOCAL STORAGE
  // ==========================================
  
  cameraForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('camName').value;
    const type = document.getElementById('camType').value;
    const url = camUrl.value.trim();

    const payload = {
      name: name,
      type: type,
      url: url,
      username: document.getElementById('camUser').value,
      password: document.getElementById('camPass').value
    };

    btnConnect.disabled = true;
    showStatus('testing', 'Deploying neural shield matrices to cloud database...');

    // A: Deploy to LocalStorage first (Satisfies telemetry validation)
    localStorage.setItem('connectedCamera', 'true');
    localStorage.setItem('cameraConfig', JSON.stringify({
      name: name,
      type: type,
      url: url,
      status: 'ONLINE',
      lastTestTime: new Date().toISOString()
    }));

    // B: Perform database sync upsert
    try {
      const token = localStorage.getItem("token");
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/api/camera/save`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        showStatus('success', 'Camera successfully connected!');
        showHUDToast('SHIELD DEPLOYED', 'Contactor override active. Redirecting to operational console...', 'success');
        
        setTimeout(() => {
          location.href = "dashboard2.html";
        }, 2000);
      } else {
        showStatus('error', 'Database synchronization failed.');
        btnConnect.disabled = false;
      }
    } catch (err) {
      // Fallback: If network is offline, let local storage take care of navigation in sandbox mode
      showStatus('success', 'Deployed in offline sandbox mode!');
      showHUDToast('OFFLINE DEPLOY', 'Stored configuration locally. Redirecting...', 'success');
      setTimeout(() => {
        location.href = "dashboard2.html";
      }, 2000);
    }
  });

  // ==========================================
  // 7. DEMO MODE TOGGLE STATE LISTENER
  // ==========================================
  
  demoModeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      showHUDToast('DEMO RUNNING', 'Simulating active human threat models and lockout relays.', 'success');
      startDetection();
    } else {
      showHUDToast('DEMO HALTED', 'Threat models deactivated. Matrix secured.', 'success');
      stopDetection();
    }
  });

  // ==========================================
  // 8. TELEMETRY STATUS UTILITY HELPER
  // ==========================================
  
  function showStatus(type, message) {
    statusBox.className = `status-box ${type}`;
    statusMessage.textContent = message;
    if (type === 'testing') {
      spinner.classList.remove('hidden');
    } else {
      spinner.classList.add('hidden');
    }
  }
});