document.addEventListener('DOMContentLoaded', async () => {
  // 1. SELECT UI ELEMENTS
  const btnTest = document.getElementById('btnTest');
  const btnConnect = document.getElementById('btnConnect');
  const statusBox = document.getElementById('statusBox');
  const statusMessage = document.getElementById('statusMessage');
  const spinner = document.getElementById('spinner');
  const urlWarning = document.getElementById('urlWarning');
  const camUrl = document.getElementById('camUrl');
  const cameraForm = document.getElementById('cameraForm');

  // 2. AUTO-REDIRECT LOGIC (Check if camera exists in DB)
  // ... existing variable declarations (btnTest, btnConnect, etc.)

  async function checkExistingCamera() {
    try {
      const response = await fetch('/api/camera/latest');
      const data = await response.json();

      if (data.success && data.camera) {
        console.log("Persistent camera found. Jumping to Dashboard.");
        window.location.href = "/dashboard.html";
        return true;
      } else {
        // If the request succeeds but there's no camera data
        console.log("No camera data in DB, showing form.");
        document.body.classList.add('show-form');
      }
    } catch (err) {
      console.log("No previous camera found, showing setup form.");
      document.body.classList.add('show-form');

      // Safety fallback if CSS fails
      const formElement = document.getElementById('cameraForm');
      if (formElement) formElement.style.display = 'block';

      return false;
    }
  }
  // Run the check. If a camera is found, stop the script here.
  const hasCamera = await checkExistingCamera();
  if (hasCamera) return;

  // 3. REAL-TIME LOCAL IP WARNING
  camUrl.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const isLocal = val.includes('192.168.') || val.includes('10.') ||
      val.includes('localhost') || val.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);

    if (isLocal) {
      urlWarning.innerHTML = '⚠️ Private IP detected. Requires <b>Local Edge Agent</b> instead of Cloud Connection.';
      urlWarning.classList.remove('hidden');
    } else {
      urlWarning.classList.add('hidden');
    }
  });

  // 4. TEST CONNECTION LOGIC
  btnTest.addEventListener('click', async () => {
    const url = camUrl.value;
    if (!url) {
      showStatus('error', 'Please enter a Stream URL to test.');
      return;
    }

    showStatus('testing', 'Testing connection to camera...');
    btnConnect.disabled = true;

    try {
      const response = await fetch('/api/camera/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (data.isLocal) {
        showStatus('error', data.message);
        btnConnect.disabled = false;
      } else if (data.success) {
        showStatus('success', 'Connection successful! Ready to save.');
        btnConnect.disabled = false;
      } else {
        showStatus('error', 'Failed to connect: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      showStatus('error', 'Network error while testing connection.');
      btnConnect.disabled = false;
    }
  });

  // 5. SAVE TO DATABASE LOGIC
  cameraForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById('camName').value,
      type: document.getElementById('camType').value,
      url: camUrl.value,
      username: document.getElementById('camUser').value,
      password: document.getElementById('camPass').value
    };

    btnConnect.disabled = true;
    showStatus('testing', 'Saving camera to database...');

    try {
      const response = await fetch('/api/camera/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        showStatus('success', 'Camera successfully connected!');
        setTimeout(() => {
          const target = localStorage.getItem("targetDashboard") || "dashboard.html";
          location.href = target;
        }, 1500);
      } else {
        showStatus('error', 'Failed to save camera.');
        btnConnect.disabled = false;
      }
    } catch (err) {
      showStatus('error', 'Network error while saving.');
      btnConnect.disabled = false;
    }
  });

  // 6. STATUS UI HELPER
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