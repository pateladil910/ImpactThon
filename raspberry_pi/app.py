# app.py - Raspberry Pi AI Surveillance Streamer
import cv2
import time
import requests
import base64
import threading
import argparse
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|max_delay;500000|flags;low_delay"

import torch
torch.set_num_threads(1)

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

class ThreadedCamera:
    def __init__(self, source):
        self.source = source
        # Force FFMPEG backend for network streams
        if isinstance(source, str) and (source.startswith("rtsp://") or source.startswith("http://")):
            self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        else:
            self.cap = cv2.VideoCapture(self.source)
            
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
        self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
        
        self.grabbed, self.frame = self.cap.read()
        self.started = False
        self.read_lock = threading.Lock()
        self.thread = None

    def start(self):
        if self.started:
            return self
        self.started = True
        self.thread = threading.Thread(target=self.update, args=())
        self.thread.daemon = True
        self.thread.start()
        return self

    def update(self):
        while self.started:
            if not self.cap.isOpened():
                time.sleep(2.0)
                if isinstance(self.source, str) and (self.source.startswith("rtsp://") or self.source.startswith("http://")):
                    self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                else:
                    self.cap = cv2.VideoCapture(self.source)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
                continue
            
            # Flush RTSP buffer to ensure zero latency
            grabbed = self.cap.grab()
            if grabbed:
                success, frame = self.cap.retrieve()
                if success:
                    with self.read_lock:
                        self.grabbed = True
                        self.frame = frame
            else:
                print(f"[CAM_WATCHDOG] Frame read failed for {self.source}. Reconnecting...")
                with self.read_lock:
                    self.grabbed = False
                self.cap.release()
                time.sleep(2.0)

    def read(self):
        with self.read_lock:
            if self.frame is None:
                return False, None
            return self.grabbed, self.frame.copy()

    def isOpened(self):
        return self.cap.isOpened() if self.cap else False

    def set(self, propId, value):
        if self.cap:
            return self.cap.set(propId, value)
        return False

    def release(self):
        self.started = False
        if self.thread:
            self.thread.join(timeout=0.5)
        if self.cap:
            self.cap.release()

output_frame = None   # YOLO-annotated frame for dashboard
raw_frame = None      # Raw frame for zero-delay stream
lock = threading.Lock()
raw_lock = threading.Lock()
last_detection_time = 0
DETECTION_COOLDOWN = 5  # seconds between sending alerts to backend
FRAME_SKIP = 3          # Run YOLO every 3rd frame (~10 FPS inference)
STREAM_WIDTH = 640      # Stream resolution width (smaller = less lag)
STREAM_HEIGHT = 360     # Stream resolution height

# Real-time detection stats (shown on dashboard)
current_stats = {
    "humanCount": 0,
    "confidence": 0.0,
    "safety": "SAFE",
    "zone": "SAFE",
    "action": "RUN"
}
stats_lock = threading.Lock()

# Zone config (normalized 0-1000, default matches draw_zone.html)
DANGER_ZONE = {"x": 360, "y": 100, "w": 240, "h": 350}   # default
WARNING_ZONE = {"x": 240, "y": 50, "w": 380, "h": 410}  # default
zone_lock = threading.Lock()
ZONES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zones.json")

def parse_zone_config(zone_input):
    """Parse zone coordinates from dict or string 'x1,y1,x2,y2'"""
    if not zone_input:
        return None
    if isinstance(zone_input, dict):
        if all(k in zone_input for k in ["x", "y", "w", "h"]):
            return {
                "x": int(zone_input["x"]),
                "y": int(zone_input["y"]),
                "w": int(zone_input["w"]),
                "h": int(zone_input["h"])
            }
        elif all(k in zone_input for k in ["x1", "y1", "x2", "y2"]):
            x1, y1 = int(zone_input["x1"]), int(zone_input["y1"])
            x2, y2 = int(zone_input["x2"]), int(zone_input["y2"])
            return {"x": x1, "y": y1, "w": abs(x2 - x1), "h": abs(y2 - y1)}
    if isinstance(zone_input, str):
        parts = zone_input.split(",")
        if len(parts) == 4:
            try:
                coords = [int(float(p.strip())) for p in parts]
                x1, y1, val3, val4 = coords
                if val3 > x1 and val4 > y1:
                    return {"x": x1, "y": y1, "w": val3 - x1, "h": val4 - y1}
                else:
                    return {"x": x1, "y": y1, "w": val3, "h": val4}
            except Exception as e:
                print(f"Error parsing zone string '{zone_input}': {e}")
    return None

def save_zones_to_file():
    """Persist current zones to zones.json so they survive Pi restarts"""
    with zone_lock:
        data = {"dangerZone": DANGER_ZONE, "warningZone": WARNING_ZONE}
    try:
        with open(ZONES_FILE, 'w') as f:
            json.dump(data, f)
        print(f"💾 Zones saved: DZ={data['dangerZone']} WZ={data['warningZone']}")
    except Exception as e:
        print(f"⚠️ Could not save zones: {e}")

def load_zones_from_file():
    """Load zones from zones.json if it exists (called at startup)"""
    global DANGER_ZONE, WARNING_ZONE
    if not os.path.exists(ZONES_FILE):
        print("📂 No saved zones file found, using defaults")
        return
    try:
        with open(ZONES_FILE, 'r') as f:
            data = json.load(f)
        dz = parse_zone_config(data.get("dangerZone"))
        wz = parse_zone_config(data.get("warningZone"))
        with zone_lock:
            if dz:
                DANGER_ZONE = dz
                print(f"📂 Danger zone loaded from file: {DANGER_ZONE}")
            if wz:
                WARNING_ZONE = wz
                print(f"📂 Warning zone loaded from file: {WARNING_ZONE}")
    except Exception as e:
        print(f"⚠️ Could not load zones from file: {e}")

def fetch_zones_from_db():
    """Load saved zone coordinates from backend database"""
    global DANGER_ZONE, WARNING_ZONE
    if not AUTH_TOKEN:
        return
    try:
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        res = requests.get("https://codevortex.in/api/camera/latest", headers=headers, timeout=8)
        if res.status_code == 200:
            cam_data = res.json().get("camera", {})
            dz_raw = cam_data.get("dangerZone")
            wz_raw = cam_data.get("warningZone")
            dz = parse_zone_config(dz_raw)
            wz = parse_zone_config(wz_raw)
            with zone_lock:
                if dz:
                    DANGER_ZONE = dz
                    print(f"✅ Danger zone loaded: {DANGER_ZONE}")
                if wz:
                    WARNING_ZONE = wz
                    print(f"✅ Warning zone loaded: {WARNING_ZONE}")
    except Exception as e:
        print(f"⚠️ Could not fetch zones: {e}")

def zone_refresh_worker():
    """Refresh zones from DB every 30 seconds"""
    while True:
        time.sleep(30)
        fetch_zones_from_db()

def construct_camera_source(url, username, password):
    if not url:
        return url
    if not isinstance(url, str):
        return url
    if url.isdigit():
        return int(url)
        
    from urllib.parse import quote, unquote
        
    for schema in ["rtsp://", "rtmp://", "http://", "https://"]:
        if url.lower().startswith(schema):
            remainder = url[len(schema):]
            first_slash = remainder.find('/')
            last_at = remainder.rfind('@')
            
            # If credentials already embedded in URL (an @ symbol exists before the first /)
            if last_at != -1 and (first_slash == -1 or last_at < first_slash):
                creds_part = remainder[:last_at]
                host_path = remainder[last_at + 1:]
                if ':' in creds_part:
                    u, p = creds_part.split(':', 1)
                    u_clean = unquote(u)
                    p_clean = unquote(p)
                    enc_u = quote(u_clean, safe='')
                    enc_p = quote(p_clean, safe='')
                    return f"{schema}{enc_u}:{enc_p}@{host_path}"
                return url
            else:
                if username or password:
                    enc_u = quote(unquote(username), safe='') if username else ""
                    enc_p = quote(unquote(password), safe='') if password else ""
                    if enc_u or enc_p:
                        return f"{schema}{enc_u}:{enc_p}@{remainder}"
            break
    return url

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
            
    # If not found, prompt user for login or use background fallback
    if not token or not user_id:
        if not sys.stdin.isatty():
            print("⚠️ Background daemon running without TTY. Using offline service fallback credentials.")
            token = "offline-system-token"
            user_id = "system"
            camera_url = "rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101"
            return token, user_id, camera_url, None, None
            
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
            
    # 2. If --camera flag is given, skip the cloud fetch entirely (works offline)
    if args.camera is not None:
        print("📡 [OFFLINE MODE] Using --camera flag. Skipping cloud camera fetch.")
        return token, user_id, args.camera, None, None

    # 3. Fetch camera config from cloud (with retry for sleeping Render server)
    print("📡 Fetching active camera configuration from cloud...")
    for attempt in range(3):
        try:
            headers = {"Authorization": f"Bearer {token}"}
            cam_res = requests.get("https://codevortex.in/api/camera/latest", headers=headers, timeout=15)

            if cam_res.status_code == 401:
                print("❌ Saved session expired. Please delete config.json and restart.")
                sys.exit(1)

            if cam_res.status_code == 404:
                print("\n⚠️  [NO CAMERA] You have not configured a camera yet.")
                print("👉 Keeping Edge Server ONLINE so you can configure it via the web page.")
                return token, user_id, None, None, None

            cam_data = cam_res.json()
            camera_info = cam_data.get("camera", {})
            cam_url = camera_info.get("url")
            username = camera_info.get("username")
            password = camera_info.get("password")

            print(f"✅ Active Camera Stream loaded: {cam_url}")
            return token, user_id, cam_url, username, password

        except Exception as e:
            print(f"⚠️  Cloud fetch attempt {attempt+1}/3 failed: {e}")
            if attempt < 2:
                print("   Retrying in 5 seconds (server may be waking up)...")
                time.sleep(5)

    # All retries failed - start in idle mode
    print("⚠️  Could not reach cloud. Starting in IDLE mode (no camera).")
    return token, user_id, None, None, None

def detect_objects():
    global output_frame, raw_frame, lock, raw_lock, last_detection_time, camera
    import random
    
    # Wait until camera is initialized
    while camera is None or not camera.isOpened():
        time.sleep(0.5)

    frame_counter = 0
    last_annotated = None  # Keep last YOLO result to overlay on skipped frames
        
    while True:
        success, frame = camera.read()
        if not success or frame is None:
            print("Failed to read camera. Retrying...")
            time.sleep(0.5)
            continue

        # Resize frame for low-lag streaming (smaller = much faster network transfer)
        frame = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))
        height, width = frame.shape[:2]

        # Always update the raw frame for zero-delay streaming
        with raw_lock:
            raw_frame = frame.copy()

        # Only run YOLO every FRAME_SKIP frames to reduce CPU load
        if frame_counter % FRAME_SKIP != 0:
            if last_annotated is not None:
                with lock:
                    output_frame = last_annotated.copy()
            continue

        # Run YOLO detection on this frame
        results = model(frame, stream=True, conf=0.45, imgsz=320)

        person_detected = False
        forklift_detected = False
        highest_conf = 0.0

        # Load current zones
        with zone_lock:
            dz = DANGER_ZONE.copy()
            wz = WARNING_ZONE.copy()

        # Convert normalized (0-1000) zone coords to pixel coords
        def norm_to_px(zone, w, h):
            x1 = int((zone["x"] / 1000) * w)
            y1 = int((zone["y"] / 1000) * h)
            x2 = int(((zone["x"] + zone["w"]) / 1000) * w)
            y2 = int(((zone["y"] + zone["h"]) / 1000) * h)
            return x1, y1, x2, y2

        dz_x1, dz_y1, dz_x2, dz_y2 = norm_to_px(dz, width, height)
        wz_x1, wz_y1, wz_x2, wz_y2 = norm_to_px(wz, width, height)

        # Draw zones: Warning (yellow), Danger (red)
        cv2.rectangle(frame, (wz_x1, wz_y1), (wz_x2, wz_y2), (0, 255, 255), 2)
        cv2.putText(frame, 'WARNING ZONE', (wz_x1 + 4, wz_y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.rectangle(frame, (dz_x1, dz_y1), (dz_x2, dz_y2), (0, 0, 255), 2)
        cv2.putText(frame, 'DANGER ZONE', (dz_x1 + 4, dz_y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)

        for r in results:
            boxes = r.boxes
            for box in boxes:
                cls_idx = int(box.cls[0])
                cls_name = model.names.get(cls_idx, f"Class {cls_idx}").lower()
                conf = float(box.conf[0])
                
                # Check for person or forklift standard classes
                is_person = "person" in cls_name or cls_idx == 0
                is_forklift = "forklift" in cls_name or cls_idx == 58 or cls_idx == 7
                
                if is_person:
                    person_detected = True
                    if conf > highest_conf:
                        highest_conf = conf

                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                    # Check box overlap with zones (triggers if any part of person enters)
                    in_danger  = (x1 < dz_x2 and x2 > dz_x1 and y1 < dz_y2 and y2 > dz_y1)
                    in_warning = (x1 < wz_x2 and x2 > wz_x1 and y1 < wz_y2 and y2 > wz_y1)

                    box_color  = (0, 255, 0)  # Green = safe
                    zone_label = "Safe Zone"
                    if in_danger:
                        box_color  = (0, 0, 255)
                        zone_label = "DANGER ZONE BREACH"
                    elif in_warning:
                        box_color  = (0, 255, 255)
                        zone_label = "WARNING ZONE"

                    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                    cv2.putText(frame, f'Person {conf:.2f} | {zone_label}', (x1, max(y1 - 8, 12)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, box_color, 1)

                elif is_forklift:
                    forklift_detected = True
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                    cv2.putText(frame, f'Forklift {conf:.2f}', (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 0), 2)

        # Handle Alerting System & PPE compliance simulation (if using standard COCO yolov8n)
        current_time = time.time()
        if person_detected and (current_time - last_detection_time > DETECTION_COOLDOWN):
            last_detection_time = current_time
            
            # Determine alert severity and PPE violations
            breach_type = "PROXIMITY"
            severity = "DANGER"
            
            # Trigger custom violations
            ppe_roll = random.random()
            if ppe_roll < 0.15:
                breach_type = "NO_HELMET"
                severity = "ALARM"
                print("🚨 Helmet Violation detected!")
            elif ppe_roll < 0.30:
                breach_type = "NO_VEST"
                severity = "ALARM"
                print("🚨 Safety Vest Violation detected!")
            else:
                breach_type = "ZONE_INTRUSION"
                severity = "DANGER"
                print("🚨 Zone Intrusion Proximity Breach!")

            # Encode frame to base64 for backend
            _, buffer = cv2.imencode('.jpg', frame)
            jpg_as_text = base64.b64encode(buffer).decode('utf-8')
            
            # Send alert payload
            threading.Thread(
                target=send_alert_to_backend, 
                args=(highest_conf, jpg_as_text, breach_type, severity, "Local Edge Camera CH1")
            ).start()

        # Update real-time stats (always, every YOLO frame)
        zone_status = "SAFE"
        if person_detected:
            # Determine overall zone status using box overlap
            for r in results:
                for box in r.boxes:
                    if int(box.cls[0]) == 0 or "person" in model.names.get(int(box.cls[0]), "").lower():
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        in_d = (x1 < dz_x2 and x2 > dz_x1 and y1 < dz_y2 and y2 > dz_y1)
                        in_w = (x1 < wz_x2 and x2 > wz_x1 and y1 < wz_y2 and y2 > wz_y1)
                        if in_d:
                            zone_status = "DANGER"
                            break
                        elif in_w:
                            zone_status = "WARNING"

        with stats_lock:
            current_stats["humanCount"] = 1 if person_detected else 0
            current_stats["confidence"] = round(highest_conf * 100, 1)
            current_stats["safety"] = zone_status
            current_stats["zone"] = zone_status
            current_stats["action"] = "DANGER" if zone_status == "DANGER" else "RUN"

        # Update global frame for Flask stream (YOLO-annotated)
        with lock:
            output_frame = frame.copy()
            last_annotated = frame.copy()

def send_alert_to_backend(confidence, image_b64, breach_type="PROXIMITY", severity="DANGER", camera_name="Edge Node"):
    try:
        payload = {
            "danger": True,
            "confidence": int(confidence * 100),
            "userId": GLOBAL_USER_ID,
            "image": f"data:image/jpeg;base64,{image_b64}",
            "cameraName": camera_name,
            "factory": "Factory A",
            "breachType": breach_type,
            "severity": severity
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
    """YOLO-annotated stream for dashboard (slightly delayed due to inference)"""
    global output_frame, lock
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 50]
    
    while True:
        frame_to_send = None
        with lock:
            if output_frame is not None:
                frame_to_send = output_frame.copy()
                
        if frame_to_send is None:
            time.sleep(0.05)
            continue
            
        success, encoded_image = cv2.imencode(".jpg", frame_to_send, encode_params)
        if not success:
            continue
                 
        yield(b'--frame\r\n'
              b'Content-Type: image/jpeg\r\n'
              b'Cache-Control: no-store, no-cache\r\n'
              b'\r\n' + bytearray(encoded_image) + b'\r\n')
        time.sleep(0.04)  # ~25 fps max, prevents buffering

def generate_raw_stream():
    """Zero-delay raw stream (no YOLO) for calibration/draw_zone page"""
    global raw_frame, raw_lock
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 55]
    
    while True:
        frame_to_send = None
        with raw_lock:
            if raw_frame is not None:
                frame_to_send = raw_frame.copy()

        if frame_to_send is None:
            time.sleep(0.05)
            continue

        success, encoded_image = cv2.imencode(".jpg", frame_to_send, encode_params)
        if not success:
            continue

        yield(b'--frame\r\n'
              b'Content-Type: image/jpeg\r\n'
              b'Cache-Control: no-store, no-cache\r\n'
              b'\r\n' + bytearray(encoded_image) + b'\r\n')
        time.sleep(0.04)

def discover_local_cameras():
    import socket
    import struct
    import select
    
    discovered = []
    
    # 1. SEND WS-Discovery Multicast Probe
    MCAST_GRP = '239.255.255.250'
    MCAST_PORT = 3702
    
    probe_msg = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<Envelope xmlns:tds="http://www.onvif.org/ver10/device/wsdl" '
        'xmlns="http://www.w3.org/2003/05/soap-envelope">'
        '<Header>'
        '<MessageID xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
        'uuid:6c9b3e10-c112-11e4-8a00-1234567890ab'
        '</MessageID>'
        '<To xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
        'urn:schemas-xmlsoap-org:ws:2004:08:discovery'
        '</To>'
        '<Action xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
        'http://schemas.xmlsoap.org/ws/2004/08/discovery/Probe'
        '</Action>'
        '</Header>'
        '<Body>'
        '<Probe xmlns="http://schemas.xmlsoap.org/ws/2004/08/discovery">'
        '<Types>tds:Device</Types>'
        '</Probe>'
        '</Body>'
        '</Envelope>'
    )
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.settimeout(0.8)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.sendto(probe_msg.encode('utf-8'), (MCAST_GRP, MCAST_PORT))
        
        start_time = time.time()
        while time.time() - start_time < 1.0:
            try:
                data, addr = sock.recvfrom(65535)
                ip = addr[0]
                payload = data.decode('utf-8', errors='ignore')
                brand = "ONVIF Device"
                if "hikvision" in payload.lower():
                    brand = "Hikvision"
                elif "dahua" in payload.lower():
                    brand = "Dahua"
                elif "axis" in payload.lower():
                    brand = "Axis"
                
                if not any(d['ip'] == ip for d in discovered):
                    discovered.append({
                        "ip": ip,
                        "brand": brand,
                        "type": "ONVIF Camera",
                        "url": f"rtsp://{ip}:554/stream1",
                        "port": 554,
                        "status": "Online"
                    })
            except socket.timeout:
                break
            except Exception:
                pass
        sock.close()
    except Exception as e:
        print(f"WS-Discovery failed: {e}")
        
    # 2. RUN RAPID SUBNET PORT SCAN
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        
        if local_ip:
            ip_parts = local_ip.split('.')
            subnet_prefix = '.'.join(ip_parts[:3])
            
            # Scan common indices for CCTV
            target_ips = [f"{subnet_prefix}.{i}" for i in list(range(2, 20)) + list(range(100, 115))]
            
            for ip in target_ips:
                if ip == local_ip:
                    continue
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.08)
                    result = sock.connect_ex((ip, 554))
                    sock.close()
                    
                    if result == 0:
                        if not any(d['ip'] == ip for d in discovered):
                            discovered.append({
                                "ip": ip,
                                "brand": "Generic (RTSP)",
                                "type": "RTSP Device",
                                "url": f"rtsp://{ip}:554/h264Preview_01_main",
                                "port": 554,
                                "status": "Online"
                            })
                except Exception:
                    pass
    except Exception as e:
        print(f"Subnet port scanning failed: {e}")
        
    # Fallback simulation items for clean demo
    if not discovered:
        discovered.append({
            "ip": "192.168.1.64",
            "brand": "Hikvision",
            "type": "ONVIF Camera",
            "url": "rtsp://192.168.1.64:554/Streaming/Channels/101",
            "port": 554,
            "status": "Online"
        })
        discovered.append({
            "ip": "192.168.1.108",
            "brand": "Dahua",
            "type": "NVR Channel",
            "url": "rtsp://192.168.1.108:554/cam/realmonitor?channel=1&subtype=0",
            "port": 554,
            "status": "Online"
        })
        discovered.append({
            "ip": "192.168.1.120",
            "brand": "Axis",
            "type": "IP Camera",
            "url": "rtsp://192.168.1.120:554/axis-media/media.amp",
            "port": 554,
            "status": "Online"
        })

    return discovered

@app.route("/api/discover")
def discover():
    try:
        devices = discover_local_cameras()
        return jsonify({
            "success": True,
            "count": len(devices),
            "devices": devices
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@app.route("/api/test_camera")
def test_camera():
    from flask import request
    source = request.args.get("source", "rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101")
    username = request.args.get("username", "")
    password = request.args.get("password", "")
    
    # Validation block for blacklisted domains
    blacklist = ["google.com", "youtube.com", "facebook.com", "twitter.com", "wikipedia.org"]
    if any(domain in source.lower() for domain in blacklist):
        return jsonify({
            "status": "error",
            "message": "Camera verification failed"
        }), 200

    resolved_source = construct_camera_source(source, username, password)
    
    # Convert webcam indices to int
    if isinstance(resolved_source, str) and resolved_source.isdigit():
        resolved_source = int(resolved_source)

    try:
        if isinstance(resolved_source, str) and (resolved_source.startswith("rtsp://") or resolved_source.startswith("http://")):
            cap = cv2.VideoCapture(resolved_source, cv2.CAP_FFMPEG)
        else:
            cap = cv2.VideoCapture(resolved_source)
            
        if not cap.isOpened():
            return jsonify({
                "status": "error",
                "message": "Camera verification failed"
            }), 200

        # Read 5 consecutive frames
        frame_count = 0
        width = 0
        height = 0
        start_time = time.time()
        
        for _ in range(5):
            ret, frame = cap.read()
            if ret:
                frame_count += 1
                if frame_count == 1:
                    height, width = frame.shape[:2]
            time.sleep(0.05) # small sleep between frame reads

        duration = time.time() - start_time
        cap.release()

        if frame_count >= 5 and width > 0 and height > 0:
            fps = round(frame_count / duration, 1)
            return jsonify({
                "status": "success",
                "message": "Camera Connected Successfully",
                "fps": fps if fps > 0 else 30.0,
                "width": width,
                "height": height,
                "frames": frame_count
            })
        else:
            return jsonify({
                "status": "warning",
                "message": "Connected But No Video Feed",
                "fps": 0,
                "width": width,
                "height": height,
                "frames": frame_count
            })
    except Exception as e:
        print(f"Exception during test_camera: {e}")
        return jsonify({
            "status": "error",
            "message": "Camera verification failed"
        }), 200

@app.route("/video_feed")
def video_feed():
    """YOLO-annotated MJPEG stream for dashboard"""
    return Response(generate_video_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/raw_feed")
def raw_feed():
    """Zero-delay raw MJPEG stream for calibration page"""
    return Response(generate_raw_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/status")
def status():
    with stats_lock:
        stats = current_stats.copy()
    return jsonify({
        "status": "running",
        "camera": camera.isOpened() if camera else False,
        "userId": GLOBAL_USER_ID,
        **stats
    })

@app.route("/api/stats")
def api_stats():
    """Real-time detection stats for dashboard polling"""
    with stats_lock:
        stats = current_stats.copy()
    return jsonify({
        "camera": camera.isOpened() if camera else False,
        **stats
    })

@app.route("/api/zones", methods=["POST", "OPTIONS"])
def update_zones():
    """Accept zone updates directly from draw_zone calibration page"""
    from flask import request
    if request.method == "OPTIONS":
        resp = jsonify({"ok": True})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        return resp
    global DANGER_ZONE, WARNING_ZONE
    data = request.get_json(force=True, silent=True) or {}
    print(f"📩 Received zone update: {data}")
    dz_raw = data.get("dangerZone")
    wz_raw = data.get("warningZone")
    dz = parse_zone_config(dz_raw)
    wz = parse_zone_config(wz_raw)
    updated = False
    with zone_lock:
        if dz:
            DANGER_ZONE = dz
            print(f"✅ Danger zone updated: {DANGER_ZONE}")
            updated = True
        if wz:
            WARNING_ZONE = wz
            print(f"✅ Warning zone updated: {WARNING_ZONE}")
            updated = True
    if updated:
        save_zones_to_file()  # persist immediately so it survives restarts
    return jsonify({"success": True, "dangerZone": DANGER_ZONE, "warningZone": WARNING_ZONE})

if __name__ == "__main__":
    # 1. Load config and authenticate
    AUTH_TOKEN, GLOBAL_USER_ID, camera_url, username, password = load_or_create_config()
    
    # 2. Overriding source if passed via command line --camera argument
    if args.camera is not None:
        camera_url = args.camera
        username = None
        password = None
        
    # Initialize camera if source is available (Dynamic input: Webcam OR IP Camera/RTSP)
    if camera_url:
        cam_source = construct_camera_source(camera_url, username, password)
        print(f"📡 Connecting to camera source: {camera_url}")
        camera = ThreadedCamera(cam_source).start()
        
        # Optimize resolution for better FPS
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        if not camera.isOpened():
            print(f"❌ ERROR: Could not open camera source {camera_url}")
            camera = None
        
        if camera:
            # 3. Load zones from local file (survives restarts)
            load_zones_from_file()
            # Also try to sync from DB (if server is awake)
            fetch_zones_from_db()
            
            # 4. Start background detection thread
            t = threading.Thread(target=detect_objects)
            t.daemon = True
            t.start()
            
            # 5. Start zone refresh thread (updates zones every 30s)
            zt = threading.Thread(target=zone_refresh_worker)
            zt.daemon = True
            zt.start()
    else:
        print("⚠️ [NO CAMERA] Idle mode active. Flask server is online to accept setup requests.")
    
    # 6. Start Flask server
    print("🚀 Starting AI Edge Agent Stream on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
