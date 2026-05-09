document.addEventListener('DOMContentLoaded', () => {
  const btnTest = document.getElementById('btnTest');
  const btnConnect = document.getElementById('btnConnect');
  const statusBox = document.getElementById('statusBox');
  const statusMessage = document.getElementById('statusMessage');
  const spinner = document.getElementById('spinner');
  const urlWarning = document.getElementById('urlWarning');
  const camUrl = document.getElementById('camUrl');

  // Real-time local IP check in frontend as well
  camUrl.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    if (val.includes('192.168.') || val.includes('10.') || val.includes('localhost') || val.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
      urlWarning.innerHTML = '⚠️ Private IP detected. Requires <b>Local Edge Agent</b> instead of Cloud Connection.';
      urlWarning.classList.remove('hidden');
    } else {
      urlWarning.classList.add('hidden');
    }
  });

  btnTest.addEventListener('click', async () => {
    const url = camUrl.value;
    if (!url) {
      showStatus('error', 'Please enter a Stream URL to test.');
      return;
    }

    showStatus('testing', 'Testing connection to camera...');
    btnConnect.disabled = true;

    try {
      // If deployed, this should be the full URL or relative if on same domain
      const response = await fetch('/api/camera/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();

      if (data.isLocal) {
        showStatus('error', data.message);
        // Even if it's local, we allow them to save it for their Edge Agent to use
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
      // Allow save anyway just in case the backend is down but the user wants to force save
      btnConnect.disabled = false; 
    }
  });

  document.getElementById('cameraForm').addEventListener('submit', async (e) => {
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
