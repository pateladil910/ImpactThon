# app.py - Raspberry Pi AI Surveillance Streamer
import cv2
import time
import requests
import base64
import threading
import argparse
import os
import sys
import json
import getpass
from flask import Flask, Response, jsonify
from flask_cors import CORS
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
BACKEND_API_URL = "https://codevortex.in/api/detection"
CONFIG_FILE = "config.json"

# Parse command-line arguments (optional, defaults to database configuration)
parser = argparse.ArgumentParser(description="AI Edge Agent for Camera Monitoring")
parser.add_argument('--camera', type=str, default=None, help='Override Camera URL (RTSP/HTTP) or Webcam ID (0)')
args = parser.parse_args()

# Load YOLOv8 model (yolov8n is fastest for Raspberry Pi)
model = YOLO('yolov8n.pt') 

# Global state variables
camera = None
cam_source = None
AUTH_TOKEN = None
GLOBAL_USER_ID = None

output_frame = None
lock = threading.Lock()
last_detection_time = 0
DETECTION_COOLDOWN = 5 # seconds between sending alerts to backend

def load_or_create_config():
    token = None
    user_id = None
    
    # Try loading from local config.json
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
                token = config.get("token")
                user_id = config.get("userId")
                print("💾 Found saved login session.")
        except Exception as e:
            print("Error loading config.json, prompting login.")
            
    # If not found, prompt user for login
    if not token or not user_id:
        print("\n🔑 --- AI Safety Shield Edge Agent Login ---")
        email = input("Email: ")
        password = getpass.getpass("Password: ")
        
        try:
            # 1. Log in to Render backend
            login_res = requests.post("https://codevortex.in/api/auth/login", json={
                "email": email,
                "password": password
            }, timeout=10)
            
            if login_res.status_code != 200:
                print("❌ Invalid email or password. Access denied.")
                sys.exit(1)
                
            auth_data = login_res.json()
            token = auth_data.get("token")
            user_id = auth_data.get("user", {}).get("id")
            
            if not token or not user_id:
                print("❌ Failed to parse session token. Access denied.")
                sys.exit(1)
                
            print(f"👋 Welcome, {auth_data.get('user', {}).get('name', 'Operator')}!")
            
            # Save configuration locally for next start
            with open(CONFIG_FILE, 'w') as f:
                json.dump({
                    "token": token,
                    "userId": user_id
                }, f)
            print("💾 Login session saved locally.")
            
        except Exception as e:
            print(f"❌ Authentication Error: {e}")
            sys.exit(1)
            
    # 2. ALWAYS fetch User's Latest Camera details from the cloud to reflect web edits
    try:
        print("📡 Fetching active camera configuration from cloud...")
        headers = {"Authorization": f"Bearer {token}"}
        cam_res = requests.get("https://codevortex.in/api/camera/latest", headers=headers, timeout=10)
        
        if cam_res.status_code == 401:
            print("❌ Saved session expired. Please delete config.json and restart to login again.")
            sys.exit(1)
            
        if cam_res.status_code == 404:
            print("\n⚠️  [NO CAMERA] You have not configured a camera yet.")
            print("👉 Please log in to https://codevortex.in/pages/camera_setup.html and connect a camera first!")
            sys.exit(1)
            
        cam_data = cam_res.json()
        cam_url = cam_data.get("camera", {}).get("url")
        
        print(f"✅ Active Camera Stream loaded: {cam_url}")
        return token, user_id, cam_url
        
    except Exception as e:
        print(f"❌ Connection/Setup Error: {e}")
        sys.exit(1)

def detect_objects():
    global output_frame, lock, last_detection_time, camera
    
    # Wait until camera is initialized
    while camera is None or not camera.isOpened():
        time.sleep(0.5)
        
    while True:
        success, frame = camera.read()
        if not success:
            print("Failed to read camera. Retrying...")
            time.sleep(1)
            # Try to reconnect
            camera.open(cam_source)
            continue
            
        # Run YOLO detection
        results = model(frame, stream=True, conf=0.5)
        
        person_detected = False
        highest_conf = 0.0
        
        for r in results:
            boxes = r.boxes
            for box in boxes:
                # Class 0 in COCO dataset is 'person'
                cls = int(box.cls[0])
                if cls == 0:
                    person_detected = True
                    conf = float(box.conf[0])
                    if conf > highest_conf:
                        highest_conf = conf
                    
                    # Draw bounding box
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f'Person {conf:.2f}', (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

        # Handle Alerting System
        current_time = time.time()
        if person_detected and (current_time - last_detection_time > DETECTION_COOLDOWN):
            last_detection_time = current_time
            print(f"🚨 Person detected! Confidence: {highest_conf:.2f}")
            
            # Encode frame to base64 for backend
            _, buffer = cv2.imencode('.jpg', frame)
            jpg_as_text = base64.b64encode(buffer).decode('utf-8')
            
            # Send alert payload with dynamic userId and token
            threading.Thread(target=send_alert_to_backend, args=(highest_conf, jpg_as_text)).start()

        # Update global frame for Flask stream
        with lock:
            output_frame = frame.copy()

def send_alert_to_backend(confidence, image_b64):
    try:
        payload = {
            "danger": True,
            "confidence": int(confidence * 100),
            "userId": GLOBAL_USER_ID,
            "image": f"data:image/jpeg;base64,{image_b64}"
        }
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        res = requests.post(BACKEND_API_URL, json=payload, headers=headers, timeout=5)
        if res.status_code == 200:
            print("✅ Alert successfully synced to cloud logs & dispatched alert emails.")
        else:
            print(f"⚠️ Backend returned status {res.status_code}")
    except Exception as e:
        print(f"❌ Failed to send alert: {e}")

def generate_video_stream():
    global output_frame, lock
    
    while True:
        with lock:
            if output_frame is None:
                continue
            
            # Encode frame as JPEG
            success, encoded_image = cv2.imencode(".jpg", output_frame)
            if not success:
                continue
                
        # Yield the output frame in MJPEG byte format
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encoded_image) + b'\r\n')

@app.route("/video_feed")
def video_feed():
    # MJPEG Streaming route
    return Response(generate_video_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/status")
def status():
    return jsonify({
        "status": "running", 
        "camera": camera.isOpened() if camera else False,
        "userId": GLOBAL_USER_ID
    })

if __name__ == "__main__":
    # 1. Load config and authenticate
    AUTH_TOKEN, GLOBAL_USER_ID, camera_url = load_or_create_config()
    
    # 2. Overriding source if passed via command line --camera argument
    if args.camera is not None:
        camera_url = args.camera
        
    # Initialize camera (Dynamic input: Webcam OR IP Camera/RTSP)
    cam_source = int(camera_url) if camera_url.isdigit() else camera_url
    print(f"📡 Connecting to camera source: {cam_source}")
    camera = cv2.VideoCapture(cam_source)
    
    # Optimize resolution for better FPS
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    if not camera.isOpened():
        print(f"❌ ERROR: Could not open camera source {cam_source}")
        sys.exit(1)

    # 3. Start background detection thread
    t = threading.Thread(target=detect_objects)
    t.daemon = True
    t.start()
    
    # 4. Start Flask server
    print("🚀 Starting AI Edge Agent Stream on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
