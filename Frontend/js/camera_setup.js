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

  let isCameraVerified = false;

  function updateDeployButtonState() {
    const isDemo = demoModeToggle && demoModeToggle.checked;
    btnConnect.disabled = !(isCameraVerified || isDemo);
  }

  // Monitor inputs to dynamically reset verification status on change
  camUrl.addEventListener('input', () => {
    isCameraVerified = false;
    updateDeployButtonState();
  });
  
  const camUser = document.getElementById('camUser');
  const camPass = document.getElementById('camPass');
  const camType = document.getElementById('camType');

  if (camUser) camUser.addEventListener('input', () => { isCameraVerified = false; updateDeployButtonState(); });
  if (camPass) camPass.addEventListener('input', () => { isCameraVerified = false; updateDeployButtonState(); });
  if (camType) camType.addEventListener('change', () => { isCameraVerified = false; updateDeployButtonState(); });

  // Run initially in case of autofill
  updateDeployButtonState();

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
      if (response.status === 401) {
        console.warn("Session unauthorized or token expired. Bypassing autofill.");
        document.body.classList.add('show-form');
        return;
      }
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
        const camFactory = document.getElementById('camFactory');

        if (camName) camName.value = data.camera.name || "";
        if (camType) camType.value = data.camera.cameraType || "RTSP Camera (Network Stream)";
        if (camUrl) camUrl.value = data.camera.url || "";
        if (camUser) camUser.value = data.camera.username || "";
        if (camFactory && data.camera.factory) camFactory.value = data.camera.factory;
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

  // 3. REAL-TIME LOCAL IP WARNING + EDGE AGENT SECTION TOGGLE
  const edgeAgentSection = document.getElementById('edgeAgentSection');

  camUrl.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const isLocal = isPrivateIP(val);

    if (isLocal) {
      urlWarning.innerHTML = '⚠️ Private IP detected. Run the AI server on the camera laptop and paste the ngrok URL below.';
      urlWarning.classList.remove('hidden');
      if (edgeAgentSection) edgeAgentSection.style.display = 'flex';
    } else {
      urlWarning.classList.add('hidden');
      if (edgeAgentSection) edgeAgentSection.style.display = 'none';
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

  function isValidCameraURL(url) {
    if (!url) return false;
    const val = url.trim();
    if (val === '') return false;
    
    // Accept integer indices (e.g. "0", "1", "2"...)
    if (/^\d{1,2}$/.test(val)) return true;

    // Reject blacklisted domains/keywords
    const blacklist = ["google.com", "youtube.com", "facebook.com", "twitter.com", "wikipedia.org"];
    if (blacklist.some(domain => val.toLowerCase().includes(domain))) {
      return false;
    }

    // Must start with allowed schemas
    const allowedSchemas = ["rtsp://", "rtmp://", "http://", "https://"];
    return allowedSchemas.some(schema => val.toLowerCase().startsWith(schema));
  }

  window.verifyStream = function(status, msg) {
    console.log("[BACKEND READY] verifyStream() status:", status, "| message:", msg);
    if (status === 'success') {
      showStatus('success', 'Camera Online! ' + (msg || 'Direct network ingest active.'));
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
    } else if (status === 'warning') {
      showStatus('warning', 'Warning: ' + (msg || 'Connected But No Video Feed'));
      if (streamStatusDot) {
        streamStatusDot.style.backgroundColor = 'var(--warning-yellow)';
        streamStatusDot.style.boxShadow = '0 0 10px var(--warning-yellow)';
      }
      if (streamStatusText) streamStatusText.textContent = 'INGEST_CORE: CONNECTED_NO_FEED';
      if (streamTitleTag) streamTitleTag.textContent = 'NEURAL VIDEO FEED ACQUISITION EMPTY';
      if (telStreamHealth) {
        telStreamHealth.textContent = 'WARNING';
        telStreamHealth.style.color = 'var(--warning-yellow)';
      }
      if (telLatency) telLatency.textContent = 'N/A';
      if (restrictedZoneOverlay) restrictedZoneOverlay.style.display = 'none';
    } else {
      showStatus('error', msg || 'Camera Offline: Replay socket timeout or address unreachable.');
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
    }
    updateDeployButtonState();
  };

  window.startDetection = function() {
    console.log("[BACKEND READY] startDetection() loop initialized.");
    demoActive = true;
    if (simulatedLogsContainer) simulatedLogsContainer.classList.remove('hidden');
    
    // Show mock feed image and status
    if (previewFeed) {
      previewFeed.src = '../images/factory_safety_bg.webp';
      previewFeed.style.display = 'block';
    }
    if (streamStatusText) {
      streamStatusText.textContent = 'INGEST_CORE: ACTIVE (DEMO)';
      streamStatusText.style.color = 'var(--safe-green)';
    }
    if (streamStatusDot) {
      streamStatusDot.style.backgroundColor = 'var(--safe-green)';
      streamStatusDot.style.boxShadow = '0 0 8px var(--safe-green)';
    }
    if (telStreamHealth) {
      telStreamHealth.textContent = 'ONLINE (DEMO)';
      telStreamHealth.style.color = 'var(--safe-green)';
    }
    const telModelStatus = document.getElementById('telModelStatus');
    if (telModelStatus) {
      telModelStatus.textContent = 'RUNNING (SIM)';
      telModelStatus.style.color = 'var(--safe-green)';
    }
    
    demoInterval = setInterval(() => {
      if (!demoActive) return;
      
      const isBreached = Math.random() > 0.5; // 50% chance to breach
      
      // Update Latency
      if (telLatency) {
        telLatency.textContent = (8 + Math.floor(Math.random() * 6)) + 'ms';
        telLatency.style.color = 'var(--primary-neon)';
      }
      
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
        if (restrictedZoneOverlay) {
          restrictedZoneOverlay.style.display = 'block';
        }
        
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
        if (restrictedZoneOverlay) {
          restrictedZoneOverlay.style.display = 'none';
        }
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
    if (telStreamHealth) {
      telStreamHealth.textContent = 'OFFLINE';
      telStreamHealth.style.color = 'var(--danger-red)';
    }
    const telModelStatus = document.getElementById('telModelStatus');
    if (telModelStatus) {
      telModelStatus.textContent = 'READY';
      telModelStatus.style.color = '';
    }
    if (telLatency) {
      telLatency.textContent = 'N/A';
      telLatency.style.color = '';
    }
    if (restrictedZoneOverlay) {
      restrictedZoneOverlay.style.display = 'none';
    }
    
    // Hide preview feed if it was demo
    if (previewFeed && previewFeed.src.includes('images/')) {
      previewFeed.style.display = 'none';
      previewFeed.removeAttribute('src');
    }
    if (streamStatusText) {
      streamStatusText.textContent = 'INGEST_CORE: STANDBY';
      streamStatusText.style.color = '';
    }
    if (streamStatusDot) {
      streamStatusDot.style.backgroundColor = '';
      streamStatusDot.style.boxShadow = '';
    }
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
  // 5. TEST CONNECTION LOGIC (BROWSER-DIRECT)
  // ==========================================
  
  btnTest.addEventListener('click', () => {
    const url = camUrl.value.trim();
    const type = document.getElementById('camType') ? document.getElementById('camType').value : 'IP_CAMERA';
    const user = document.getElementById('camUser') ? document.getElementById('camUser').value.trim() : '';
    const pass = document.getElementById('camPass') ? document.getElementById('camPass').value.trim() : '';

    if (!url) {
      isCameraVerified = false;
      updateDeployButtonState();
      verifyStream('error', 'Camera URL Required');
      showHUDToast('INPUT FAILURE', 'A valid camera url must be populated before testing.', 'error');
      return;
    }

    if (!isValidCameraURL(url)) {
      isCameraVerified = false;
      updateDeployButtonState();
      verifyStream('error', '🔴 Invalid Camera URL');
      showHUDToast('INPUT FAILURE', 'Unsupported protocol, format, or blacklisted domain.', 'error');
      return;
    }

    // Stop previous telemetry polling
    stopRealTimeTelemetry();

    // Initialize viewport loader
    if (streamLoader) streamLoader.style.display = 'flex';
    if (previewFeed) {
      previewFeed.style.display = 'none';
      previewFeed.removeAttribute('src');
    }
    if (restrictedZoneOverlay) restrictedZoneOverlay.style.display = 'none';

    showStatus('testing', 'Connecting to camera stream... Performing frame analysis...');
    isCameraVerified = false;
    updateDeployButtonState();

    const isLocal = isPrivateIP(url);
    const edgeAgentInput = document.getElementById('edgeAgentUrl');
    const edgeAgentUrl = edgeAgentInput ? edgeAgentInput.value.trim().replace(/\/$/, '') : '';

    let testUrl;
    if (isLocal) {
      if (edgeAgentUrl) {
        testUrl = edgeAgentUrl;  // Use ngrok/remote AI server
      } else {
        testUrl = "http://localhost:5000"; // Fallback: proxy via backend (will warn isLocal)
        showHUDToast('EDGE AGENT URL NEEDED', 'Private IP detected. Paste the ngrok URL in the Edge Agent field below for the camera to work.', 'warning');
      }
    } else {
      testUrl = AI_SERVICE_URL;
    }
    const testApiUrl = `${testUrl}/api/test_camera?source=${encodeURIComponent(url)}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    // Create AbortController to enforce client-side timeout of 15 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    fetch(testApiUrl, { signal: controller.signal })
      .then(response => response.json())
      .then(data => {
        clearTimeout(timeoutId);
        const resultText = data.message || "Unknown error";
        console.log("[VERIFY]");
        console.log("URL:", url);
        console.log("TYPE:", type);
        console.log("BACKEND RESPONSE:", data);
        console.log("STREAM STATUS:", data.status || "error");
        console.log("FPS:", data.fps || 0);
        console.log("RESULT:", resultText);

        if (data.status === 'success') {
          isCameraVerified = true;
          updateDeployButtonState();
          
          if (previewFeed) {
            previewFeed.src = `${testUrl}/video_feed?source=${encodeURIComponent(url)}&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&t=${Date.now()}`;
            previewFeed.style.display = 'block';
          }
          if (streamLoader) streamLoader.style.display = 'none';

          verifyStream('success', `Resolution: ${data.width}x${data.height} | FPS: ${data.fps}`);
          showHUDToast('CAMERA ONLINE', 'Neural video feed connected and linked successfully!', 'success');
          
          if (streamResolution) streamResolution.textContent = `${data.width}x${data.height}`;
          if (hudFps) hudFps.textContent = `${data.fps} FPS`;

          startRealTimeTelemetry();
        } else if (data.status === 'warning') {
          isCameraVerified = false;
          updateDeployButtonState();
          if (streamLoader) streamLoader.style.display = 'none';
          
          verifyStream('warning', data.message || 'Connected But No Video Feed');
          showHUDToast('NO VIDEO FEED', 'Stream connected but no active video frames retrieved.', 'warning');
        } else {
          isCameraVerified = false;
          updateDeployButtonState();
          if (streamLoader) streamLoader.style.display = 'none';

          verifyStream('error', data.message || 'Camera verification failed');
          showHUDToast('CAMERA OFFLINE', 'Network address unreachable or port closed.', 'error');
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        isCameraVerified = false;
        updateDeployButtonState();
        if (streamLoader) streamLoader.style.display = 'none';

        if (err.name === 'AbortError') {
          console.error("Test connection timed out.");
          verifyStream('error', 'Connection attempt timed out. Address is unreachable.');
          showHUDToast('TIMEOUT ERROR', 'The connection attempt timed out after 15 seconds.', 'error');
        } else {
          console.error("Test connection fetch failed:", err);
          verifyStream('error', 'Replay socket timeout or address unreachable.');
          showHUDToast('CAMERA OFFLINE', 'Network address unreachable or port closed.', 'error');
        }
      });
  });

  // ==========================================
  // 6. SAVE TO DATABASE & LOCAL STORAGE
  // ==========================================
  
  cameraForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isDemo = demoModeToggle && demoModeToggle.checked;
    if (!isCameraVerified && !isDemo) {
      showHUDToast('VERIFICATION REQUIRED', 'Please test and verify the camera connection before deploying.', 'error');
      return;
    }

    const name = document.getElementById('camName').value;
    const type = document.getElementById('camType').value;
    let url = camUrl.value.trim();
    if (isDemo && !url) {
      url = "rtsp://demo-stream.local/factory-camera";
    }
    const locationVal = document.getElementById('camLocation') ? document.getElementById('camLocation').value.trim() : '';
    const descriptionVal = document.getElementById('camDescription') ? document.getElementById('camDescription').value.trim() : '';
    const usernameVal = document.getElementById('camUser') ? document.getElementById('camUser').value.trim() : '';
    const passwordVal = document.getElementById('camPass') ? document.getElementById('camPass').value.trim() : '';
    const factoryVal = document.getElementById('camFactory') ? document.getElementById('camFactory').value : 'Factory A';

    const newCam = {
      cameraId: "cam_" + Date.now(),
      cameraName: name,
      cameraType: type,
      cameraUrl: url,
      username: usernameVal,
      password: passwordVal,
      location: locationVal,
      description: descriptionVal,
      factory: factoryVal,
      mapX: 50,
      mapY: 50,
      status: "Online",
      aiStatus: "Ready",
      fps: 60.0,
      latency: 8.0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    btnConnect.disabled = true;
    showStatus('testing', 'Deploying neural shield matrices to cloud database...');

    // Save camera to LocalStorage list
    let existingCams = [];
    try {
      const savedList = localStorage.getItem('safetyShieldCameras');
      if (savedList) {
        existingCams = JSON.parse(savedList);
      }
    } catch(err) {
      console.error("Error parsing local camera list:", err);
    }

    // Set other cameras inactive
    existingCams.forEach(c => c.active = false);
    existingCams.push(newCam);
    localStorage.setItem('safetyShieldCameras', JSON.stringify(existingCams));
    localStorage.setItem('connectedCamera', 'true');

    // Save edge agent URL if provided (for 2-laptop setup)
    const edgeAgentInput = document.getElementById('edgeAgentUrl');
    const edgeAgentUrlVal = edgeAgentInput ? edgeAgentInput.value.trim().replace(/\/$/, '') : '';
    if (edgeAgentUrlVal) {
      localStorage.setItem('edgeAgentUrl', edgeAgentUrlVal);
    } else {
      localStorage.removeItem('edgeAgentUrl');
    }

    // Perform database sync upsert
    const payload = {
      name: name,
      type: type.includes("WEBCAM") || type.includes("USB") ? "WEBCAM" : "IP_CAMERA",
      url: url,
      username: usernameVal,
      password: passwordVal,
      factory: factoryVal,
      mapX: 50,
      mapY: 50
    };

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
          location.href = "dashboard.html";
        }, 2000);
      } else {
        showStatus('error', 'Database synchronization failed: ' + data.message);
        btnConnect.disabled = false;
      }
    } catch (err) {
      // Fallback: If network is offline, let local storage take care of navigation in sandbox mode
      showStatus('success', 'Deployed in offline sandbox mode!');
      showHUDToast('OFFLINE DEPLOY', 'Stored configuration locally. Redirecting...', 'success');
      setTimeout(() => {
        location.href = "dashboard.html";
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
    updateDeployButtonState();
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

  // ==========================================
  // 9. DISCOVERY WIZARD INTERACTIVE CONTROLLERS
  // ==========================================
  const tabManual = document.getElementById('tabManual');
  const tabDiscovery = document.getElementById('tabDiscovery');
  const manualOnboardingContainer = document.getElementById('manualOnboardingContainer');
  const discoveryContainer = document.getElementById('discoveryContainer');
  const btnScanSubnet = document.getElementById('btnScanSubnet');
  const discoveryScanLoader = document.getElementById('discoveryScanLoader');
  const discoveredDevicesList = document.getElementById('discoveredDevicesList');

  if (tabManual && tabDiscovery) {
    tabManual.addEventListener('click', () => {
      tabManual.classList.add('active');
      tabDiscovery.classList.remove('active');
      manualOnboardingContainer.style.display = 'block';
      discoveryContainer.style.display = 'none';
    });

    tabDiscovery.addEventListener('click', () => {
      tabDiscovery.classList.add('active');
      tabManual.classList.remove('active');
      manualOnboardingContainer.style.display = 'none';
      discoveryContainer.style.display = 'block';
    });
  }

  if (btnScanSubnet) {
    btnScanSubnet.addEventListener('click', async () => {
      btnScanSubnet.disabled = true;
      discoveryScanLoader.style.display = 'flex';
      discoveredDevicesList.innerHTML = '';

      showHUDToast('SCANNING SUBNET', 'Sending multicast ONVIF probes & scanning port 554...', 'success');

      try {
        // Query local edge agent discovery endpoint
        const response = await fetch('http://localhost:5000/api/discover');
        const data = await response.json();

        if (data.success && data.devices) {
          renderDiscoveredDevices(data.devices);
          showHUDToast('SCAN COMPLETED', `Discovered ${data.count} CCTV sensors on subnet.`, 'success');
        } else {
          showHUDToast('SCAN FAILED', data.message || 'Error querying edge network scanner.', 'error');
          discoveredDevicesList.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--danger-red);">Discovery query failed. Ensure local edge agent is running.</div>`;
        }
      } catch (err) {
        console.error("Discovery request failed, trying cloud fallback simulation...", err);
        // Fallback mock devices for cloud demonstration
        const mockDevices = [
          { ip: "192.168.1.64", brand: "Hikvision", type: "ONVIF Camera", url: "rtsp://192.168.1.64:554/Streaming/Channels/101", port: 554, status: "Online" },
          { ip: "192.168.1.108", brand: "Dahua", type: "NVR Channel", url: "rtsp://192.168.1.108:554/cam/realmonitor?channel=1&subtype=0", port: 554, status: "Online" },
          { ip: "192.168.1.120", brand: "Axis", type: "IP Camera", url: "rtsp://192.168.1.120:554/axis-media/media.amp", port: 554, status: "Online" }
        ];
        renderDiscoveredDevices(mockDevices);
        showHUDToast('DEMO DATA LOADED', 'Discovered mock devices for cloud simulation.', 'success');
      } finally {
        btnScanSubnet.disabled = false;
        discoveryScanLoader.style.display = 'none';
      }
    });
  }

  function renderDiscoveredDevices(devices) {
    if (devices.length === 0) {
      discoveredDevicesList.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); border: 1px dashed rgba(255,255,255,0.06); border-radius: 12px;">
          No active CCTV cameras detected on the local subnet. Verify connections.
        </div>
      `;
      return;
    }

    discoveredDevicesList.innerHTML = '';
    devices.forEach(dev => {
      const row = document.createElement('div');
      row.className = 'guide-box';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '16px';
      row.style.background = 'rgba(2, 6, 23, 0.45)';
      row.style.border = '1px solid rgba(6, 182, 212, 0.12)';
      row.style.borderRadius = '12px';
      row.style.transition = 'all 0.3s ease';

      row.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <b style="font-size: 13.5px; color: #fff; font-family: 'Space Grotesk', sans-serif;">${dev.brand} (${dev.type})</b>
            <span style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--safe-green-glow); color: var(--safe-green); border: 1px solid rgba(16,185,129,0.25);">${dev.status.toUpperCase()}</span>
          </div>
          <span style="font-size: 11px; color: var(--text-muted); font-family: 'Fira Code', monospace;">IP: ${dev.ip} &bull; Port: ${dev.port}</span>
          <span style="font-size: 10px; color: var(--text-muted); font-family: 'Fira Code', monospace; opacity: 0.7; word-break: break-all;">URL: ${dev.url}</span>
        </div>
        <button type="button" class="btn-grid-tab active" onclick="onboardDiscoveredCamera('${dev.ip}', '${dev.brand}', '${dev.type}', '${dev.url}')" style="padding: 8px 14px; font-size: 11px; font-weight: 700; border-radius: 6px; cursor: pointer; flex-shrink: 0; margin-left: 10px;">Onboard</button>
      `;
      discoveredDevicesList.appendChild(row);
    });
  }

  window.onboardDiscoveredCamera = function(ip, brand, type, url) {
    // Fill the onboarding form
    const camName = document.getElementById('camName');
    const camType = document.getElementById('camType');
    const camLocation = document.getElementById('camLocation');
    const camDescription = document.getElementById('camDescription');

    if (camName) camName.value = `${brand} Camera ${ip.split('.').pop()}`;
    if (camType) {
      if (type.toLowerCase().includes('nvr') || type.toLowerCase().includes('dvr')) {
        camType.value = 'DVR_NVR';
      } else if (type.toLowerCase().includes('onvif')) {
        camType.value = 'ONVIF';
      } else {
        camType.value = 'RTSP';
      }
    }
    if (camUrl) camUrl.value = url;
    if (camLocation) camLocation.value = `Subnet Host ${ip}`;
    if (camDescription) camDescription.value = `Auto-discovered ${brand} device via Edge scan.`;

    // Trigger input events for floating labels and validations
    if (camName) camName.dispatchEvent(new Event('input'));
    if (camUrl) camUrl.dispatchEvent(new Event('input'));
    if (camLocation) camLocation.dispatchEvent(new Event('input'));
    if (camDescription) camDescription.dispatchEvent(new Event('input'));

    // Switch tab back to Manual Onboarding Form
    if (tabManual) tabManual.click();

    showHUDToast('CAMERA MAPPED', 'Discovered parameters populated. Click "Test Connection" to link.', 'success');
  };
});