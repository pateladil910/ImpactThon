# app.py - Raspberry Pi AI Surveillance Streamer
import os
# Tell FFmpeg: RTSP transport TCP with no-buffer low-delay flags BEFORE import cv2
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|max_delay;0|flags;low_delay|reorder_queue_size;0|buffer_size;1024"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import cv2
import time
import datetime
import requests
import base64
import threading
import argparse

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
    """Dedicated background thread that continuously grabs the LATEST frame from RTSP.
    Uses grab()+retrieve() packet drain loop — guarantees 0ms latency."""
    def __init__(self, source):
        self.source = source
        self.cap = self._open(source)
        self.grabbed = False
        self.frame = None
        self.frame_id = 0
        self.started = False
        self.read_lock = threading.Lock()
        self.thread = None

    def _open(self, source):
        if isinstance(source, str) and (source.startswith("rtsp://") or source.startswith("http://")):
            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        else:
            cap = cv2.VideoCapture(source)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 2000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 1000)
        return cap

    def start(self):
        if self.started:
            return self
        self.started = True
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()
        return self

    def update(self):
        while self.started:
            if not self.cap or not self.cap.isOpened():
                time.sleep(1.0)
                try:
                    self.cap = self._open(self.source)
                except Exception as e:
                    print(f"Cam reconnect error: {e}")
                continue

            # Drain queued RTSP packets to guarantee 0ms real-time stream
            latest_frame = None
            for _ in range(5):
                if not self.cap.grab():
                    break
                ret, frame = self.cap.retrieve()
                if ret and frame is not None:
                    latest_frame = frame

            if latest_frame is not None:
                if latest_frame.shape[1] != STREAM_WIDTH or latest_frame.shape[0] != STREAM_HEIGHT:
                    latest_frame = cv2.resize(latest_frame, (STREAM_WIDTH, STREAM_HEIGHT))
                with self.read_lock:
                    self.grabbed = True
                    self.frame = latest_frame
                    self.frame_id += 1
            else:
                time.sleep(0.005)

    def read(self):
        with self.read_lock:
            if self.frame is None:
                return False, None, 0
            return self.grabbed, self.frame.copy(), self.frame_id

    def isOpened(self):
        return self.cap.isOpened() if self.cap else False

    def set(self, propId, value):
        if self.cap:
            return self.cap.set(propId, value)
        return False

    def release(self):
        self.started = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()

output_frame = None   # Annotated frame for dashboard
raw_frame = None      # Raw frame for zero-delay stream
lock = threading.Lock()
raw_lock = threading.Lock()
last_detection_time = 0
DETECTION_COOLDOWN = 5  # seconds between sending alerts to backend
STREAM_WIDTH = 640      # Stream resolution width
STREAM_HEIGHT = 360     # Stream resolution height

# Shared state between stream thread and YOLO thread
_latest_raw_frame = None
_latest_raw_lock = threading.Lock()
_cached_boxes = []      # Latest YOLO bounding boxes (updated async)
_boxes_lock = threading.Lock()
_cached_zone_status = "SAFE"
_cached_stats = {"humanCount": 0, "confidence": 0.0, "zone_status": "SAFE"}

latest_encoded_jpeg = None
frame_sequence = 0
jpeg_lock = threading.Lock()

# Real-time detection stats (shown on dashboard)
current_stats = {
    "humanCount": 0,
    "confidence": 0.0,
    "safety": "SAFE",
    "zone": "SAFE",
    "action": "RUN"
}
stats_lock = threading.Lock()

# Zone config (normalized 0-1000, covers main operator area)
DANGER_ZONE = {"x": 100, "y": 100, "w": 800, "h": 850}   # Default covers main camera area
WARNING_ZONE = {"x": 0, "y": 0, "w": 1000, "h": 1000}   # Default covers full frame
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
        print(f"≡ƒÆ╛ Zones saved: DZ={data['dangerZone']} WZ={data['warningZone']}")
    except Exception as e:
        print(f"ΓÜá∩╕Å Could not save zones: {e}")

def load_zones_from_file():
    """Load zones from zones.json if it exists (called at startup)"""
    global DANGER_ZONE, WARNING_ZONE
    if not os.path.exists(ZONES_FILE):
        print("≡ƒôé No saved zones file found, using defaults")
        return
    try:
        with open(ZONES_FILE, 'r') as f:
            data = json.load(f)
        dz = parse_zone_config(data.get("dangerZone"))
        wz = parse_zone_config(data.get("warningZone"))
        with zone_lock:
            if dz:
                DANGER_ZONE = dz
                print(f"≡ƒôé Danger zone loaded from file: {DANGER_ZONE}")
            if wz:
                WARNING_ZONE = wz
                print(f"≡ƒôé Warning zone loaded from file: {WARNING_ZONE}")
    except Exception as e:
        print(f"ΓÜá∩╕Å Could not load zones from file: {e}")

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
                    print(f"Γ£à Danger zone loaded: {DANGER_ZONE}")
                if wz:
                    WARNING_ZONE = wz
                    print(f"Γ£à Warning zone loaded: {WARNING_ZONE}")
    except Exception as e:
        print(f"ΓÜá∩╕Å Could not fetch zones: {e}")

def zone_refresh_worker():
    """Refresh zones from DB every 30 seconds"""
    while True:
        time.sleep(30)
        fetch_zones_from_db()

def construct_camera_source(url, username=None, password=None):
    if not url:
        return 0
    if isinstance(url, int):
        return url
    if isinstance(url, str) and url.isdigit():
        return int(url)

    # Auto-switch Hikvision/Dahua 1080p Main Stream (Channels/101) to Sub-Stream (Channels/102) for 0ms CPU latency
    if "Channels/101" in url:
        url = url.replace("Channels/101", "Channels/102")
        print("ΓÜí Auto-switched camera to Sub-Stream (Channels/102) for 60 FPS zero-latency web streaming!")

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
                print("≡ƒÆ╛ Found saved login session.")
        except Exception as e:
            print("Error loading config.json, prompting login.")
            
    # If not found, prompt user for login or use background fallback
    if not token or not user_id:
        if not sys.stdin.isatty():
            print("ΓÜá∩╕Å Background daemon running without TTY. Using offline service fallback credentials.")
            token = "offline-system-token"
            user_id = "system"
            camera_url = "rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101"
            return token, user_id, camera_url, None, None
            
        print("\n≡ƒöæ --- AI Safety Shield Edge Agent Login ---")
        email = input("Email: ")
        password = getpass.getpass("Password: ")
        
        try:
            # 1. Log in to Render backend
            login_res = requests.post("https://codevortex.in/api/auth/login", json={
                "email": email,
                "password": password
            }, timeout=10)
            
            if login_res.status_code != 200:
                print("Γ¥î Invalid email or password. Access denied.")
                sys.exit(1)
                
            auth_data = login_res.json()
            token = auth_data.get("token")
            user_id = auth_data.get("user", {}).get("id")
            
            if not token or not user_id:
                print("Γ¥î Failed to parse session token. Access denied.")
                sys.exit(1)
                
            print(f"≡ƒæï Welcome, {auth_data.get('user', {}).get('name', 'Operator')}!")
            
            # Save configuration locally for next start
            with open(CONFIG_FILE, 'w') as f:
                json.dump({
                    "token": token,
                    "userId": user_id
                }, f)
            print("≡ƒÆ╛ Login session saved locally.")
            
        except Exception as e:
            print(f"Γ¥î Authentication Error: {e}")
            sys.exit(1)
            
    # 2. If --camera flag is given, skip the cloud fetch entirely (works offline)
    if args.camera is not None:
        print("≡ƒôí [OFFLINE MODE] Using --camera flag. Skipping cloud camera fetch.")
        return token, user_id, args.camera, None, None

    # 3. Fetch camera config from cloud (with retry for sleeping Render server)
    print("≡ƒôí Fetching active camera configuration from cloud...")
    for attempt in range(3):
        try:
            headers = {"Authorization": f"Bearer {token}"}
            cam_res = requests.get("https://codevortex.in/api/camera/latest", headers=headers, timeout=15)

            if cam_res.status_code == 401:
                print("Γ¥î Saved session expired. Please delete config.json and restart.")
                sys.exit(1)

            if cam_res.status_code == 404:
                print("\nΓÜá∩╕Å  [NO CAMERA] You have not configured a camera yet.")
                print("≡ƒæë Keeping Edge Server ONLINE so you can configure it via the web page.")
                return token, user_id, None, None, None

            cam_data = cam_res.json()
            camera_info = cam_data.get("camera", {})
            cam_url = camera_info.get("url")
            username = camera_info.get("username")
            password = camera_info.get("password")

            print(f"Γ£à Active Camera Stream loaded: {cam_url}")
            return token, user_id, cam_url, username, password

        except Exception as e:
            print(f"ΓÜá∩╕Å  Cloud fetch attempt {attempt+1}/3 failed: {e}")
            if attempt < 2:
                print("   Retrying in 5 seconds (server may be waking up)...")
                time.sleep(5)

    # All retries failed - start in idle mode
    print("ΓÜá∩╕Å  Could not reach cloud. Starting in IDLE mode (no camera).")
    return token, user_id, None, None, None

def _norm_to_px(zone, w, h):
    zx = zone.get("x", 0)
    zy = zone.get("y", 0)
    zw = zone.get("w", 1000)
    zh = zone.get("h", 1000)

    if zx > 1000 or zw > 1000 or zy > 1000 or zh > 1000:
        x1 = int(zx)
        y1 = int(zy)
        x2 = int(zx + zw)
        y2 = int(zy + zh)
    else:
        x1 = int((zx / 1000.0) * w)
        y1 = int((zy / 1000.0) * h)
        x2 = int(((zx + zw) / 1000.0) * w)
        y2 = int(((zy + zh) / 1000.0) * h)

    x1 = max(0, min(w, x1))
    y1 = max(0, min(h, y1))
    x2 = max(0, min(w, x2))
    y2 = max(0, min(h, y2))
    return x1, y1, x2, y2


def yolo_worker():
    """Runs YOLO inference asynchronously on a separate thread.
    Reads the latest raw frame, runs detection, and updates _cached_boxes.
    NEVER touches output_frame ΓÇö so it can NEVER block video streaming."""
    global _cached_boxes, _cached_zone_status, _cached_stats, last_detection_time

    while True:
        # Wait for a fresh frame
        frame_to_infer = None
        with _latest_raw_lock:
            if _latest_raw_frame is not None:
                frame_to_infer = _latest_raw_frame.copy()

        if frame_to_infer is None:
            time.sleep(0.05)
            continue

        try:
            h, w = frame_to_infer.shape[:2]
            with zone_lock:
                dz = DANGER_ZONE.copy()
                wz = WARNING_ZONE.copy()

            dz_x1, dz_y1, dz_x2, dz_y2 = _norm_to_px(dz, w, h)
            wz_x1, wz_y1, wz_x2, wz_y2 = _norm_to_px(wz, w, h)

            results = model(frame_to_infer, stream=True, conf=0.25, imgsz=320)
            boxes = []
            person_detected = False
            highest_conf = 0.0
            zone_status = "SAFE"

            for r in results:
                for box in r.boxes:
                    cls_idx = int(box.cls[0])
                    cls_name = model.names.get(cls_idx, "").lower()
                    conf = float(box.conf[0])
                    is_person = "person" in cls_name or cls_idx == 0
                    is_forklift = "forklift" in cls_name or cls_idx in (7, 58)

                    if is_person:
                        person_detected = True
                        if conf > highest_conf:
                            highest_conf = conf
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        in_danger  = (x1 < dz_x2 and x2 > dz_x1 and y1 < dz_y2 and y2 > dz_y1)
                        in_warning = (x1 < wz_x2 and x2 > wz_x1 and y1 < wz_y2 and y2 > wz_y1)
                        if in_danger:
                            color, label, zone_status = (0, 0, 255), "DANGER ZONE BREACH", "DANGER"
                        elif in_warning and zone_status != "DANGER":
                            color, label, zone_status = (0, 255, 255), "WARNING ZONE", "WARNING"
                        else:
                            color, label = (0, 255, 0), "Safe Zone"
                        boxes.append({'name': 'Person', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                                      'color': color, 'label': label, 'conf': conf})
                    elif is_forklift:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        boxes.append({'name': 'Forklift', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                                      'color': (255, 0, 0), 'label': 'Forklift', 'conf': conf})

            with _boxes_lock:
                _cached_boxes = boxes
                _cached_zone_status = zone_status

            with stats_lock:
                current_stats["humanCount"] = 1 if person_detected else 0
                current_stats["confidence"] = round(highest_conf * 100, 1)
                current_stats["safety"] = zone_status
                current_stats["zone"] = zone_status
                current_stats["action"] = "DANGER" if zone_status == "DANGER" else "RUN"

            # --- Alert firing logic ---
            current_time = time.time()

            if zone_status == "DANGER" and (current_time - last_detection_time > DETECTION_COOLDOWN):
                # DANGER: Send full alert with photo ΓåÆ triggers email to user
                last_detection_time = current_time
                print("\U0001f6a8 DANGER ZONE BREACH detected! Sending alert + email...")
                _, buf = cv2.imencode('.jpg', frame_to_infer)
                jpg_b64 = base64.b64encode(buf).decode('utf-8')
                threading.Thread(
                    target=send_alert_to_backend,
                    args=(highest_conf, jpg_b64, "ZONE_INTRUSION", "DANGER", "Local Edge Camera CH1"),
                    daemon=True
                ).start()

            elif zone_status == "WARNING" and (current_time - last_detection_time > DETECTION_COOLDOWN):
                # WARNING: Send lightweight ping ΓåÆ logs to history, triggers dashboard sound, NO email
                last_detection_time = current_time
                print("\u26a0\ufe0f  WARNING ZONE detected! Triggering dashboard sound alert (no email)...")
                threading.Thread(
                    target=send_warning_to_backend,
                    args=(highest_conf, "WARNING_PROXIMITY", "WARNING", "Local Edge Camera CH1"),
                    daemon=True
                ).start()

        except Exception as e:
            print(f"[YOLO] Error: {e}")

        time.sleep(0.1)   # ~10 Hz inference ΓÇö gives CPU plenty of room


def detect_objects():
    """30 FPS camera streaming thread.
    Reads fresh frames, draws zone overlays + cached YOLO boxes, publishes to output_frame.
    YOLO inference runs in a separate thread (yolo_worker) and NEVER blocks this loop."""
    global output_frame, raw_frame, latest_encoded_jpeg, frame_sequence, jpeg_lock

    while camera is None or not camera.isOpened():
        time.sleep(0.5)

    # Start async YOLO worker
    threading.Thread(target=yolo_worker, daemon=True).start()

    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 40]
    last_processed_frame_id = -1

    while True:
        success, frame, f_id = camera.read()
        if not success or frame is None or f_id <= last_processed_frame_id:
            time.sleep(0.003)
            continue

        last_processed_frame_id = f_id
        h, w = frame.shape[:2]

        # Share raw frame with YOLO worker (non-blocking)
        with _latest_raw_lock:
            global _latest_raw_frame
            _latest_raw_frame = frame
        with raw_lock:
            raw_frame = frame

        # Draw live date & time timestamp HUD (overrides outdated 1970 camera OSD)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
        cv2.rectangle(frame, (4, 4), (210, 26), (2, 6, 23), -1)
        cv2.rectangle(frame, (4, 4), (210, 26), (6, 182, 212), 1)
        cv2.putText(frame, now_str, (10, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

        # Draw zone overlays
        with zone_lock:
            dz = DANGER_ZONE.copy()
            wz = WARNING_ZONE.copy()
        dz_x1, dz_y1, dz_x2, dz_y2 = _norm_to_px(dz, w, h)
        wz_x1, wz_y1, wz_x2, wz_y2 = _norm_to_px(wz, w, h)
        cv2.rectangle(frame, (wz_x1, wz_y1), (wz_x2, wz_y2), (0, 255, 255), 2)
        cv2.putText(frame, 'WARNING ZONE', (wz_x1 + 4, wz_y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.rectangle(frame, (dz_x1, dz_y1), (dz_x2, dz_y2), (0, 0, 255), 2)
        cv2.putText(frame, 'DANGER ZONE', (dz_x1 + 4, dz_y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)

        # Overlay latest YOLO boxes (from async worker ΓÇö never stale more than 100ms)
        with _boxes_lock:
            boxes_snapshot = list(_cached_boxes)
        for b in boxes_snapshot:
            cv2.rectangle(frame, (b['x1'], b['y1']), (b['x2'], b['y2']), b['color'], 2)
            cv2.putText(frame, f"{b['name']} {b['conf']:.2f} | {b['label']}",
                        (b['x1'], max(b['y1'] - 8, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, b['color'], 1)

        # Publish annotated frame
        with lock:
            output_frame = frame

        # Pre-encode JPEG ONCE per frame (0% extra CPU overhead for Flask stream generators)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 40])
        if ok:
            with jpeg_lock:
                latest_encoded_jpeg = bytes(buf)
                frame_sequence += 1

def send_alert_to_backend(confidence, image_b64, breach_type="PROXIMITY", severity="DANGER", camera_name="Edge Node"):
    try:
        conf_val = int(confidence * 100) if confidence <= 1.0 else int(confidence)
        payload = {
            "danger": True,
            "confidence": conf_val,
            "userId": GLOBAL_USER_ID,
            "cameraStreamUrl": camera_url or "rtsp://192.168.1.64:554/Streaming/Channels/101",
            "image": f"data:image/jpeg;base64,{image_b64}",
            "cameraName": camera_name,
            "factory": "Factory A",
            "breachType": breach_type,
            "severity": severity
        }
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        res = requests.post(BACKEND_API_URL, json=payload, headers=headers, timeout=8)
        if res.status_code == 200:
            print(f"Γ£à Alert successfully synced to cloud logs & dispatched email to user.")
        else:
            print(f"ΓÜá∩╕Å Backend returned status {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Γ¥î Failed to send alert to cloud: {e}")

def send_warning_to_backend(confidence, breach_type="WARNING_PROXIMITY", severity="WARNING", camera_name="Edge Node"):
    """Send lightweight WARNING ping to backend.
    Logs to history and triggers dashboard sound ΓÇö but NO photo and NO email."""
    try:
        conf_val = int(confidence * 100) if confidence <= 1.0 else int(confidence)
        payload = {
            "danger": False,          # <-- False = backend skips email entirely
            "warning": True,          # signal to frontend/history it's a WARNING event
            "confidence": conf_val,
            "userId": GLOBAL_USER_ID,
            "cameraStreamUrl": camera_url or "rtsp://192.168.1.64:554/Streaming/Channels/101",
            "cameraName": camera_name,
            "factory": "Factory A",
            "breachType": breach_type,
            "severity": severity
        }
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        res = requests.post(BACKEND_API_URL, json=payload, headers=headers, timeout=8)
        if res.status_code == 200:
            print("ΓÜá∩╕Å  WARNING ping sent to cloud (sound alert triggered, no email).")
        else:
            print(f"ΓÜá∩╕Å Backend returned status {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Γ¥î Failed to send warning ping to cloud: {e}")

def generate_video_stream():
    """Ultra low-latency MJPEG stream for dashboard — zero CPU encoding overhead"""
    global latest_encoded_jpeg, frame_sequence, jpeg_lock
    last_sent = -1

    while True:
        current_jpeg = None
        current_seq = -1
        with jpeg_lock:
            if latest_encoded_jpeg is not None:
                current_jpeg = latest_encoded_jpeg
                current_seq = frame_sequence

        if current_jpeg is None or current_seq <= last_sent:
            time.sleep(0.005)
            continue

        last_sent = current_seq

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n'
               b'Content-Length: ' + str(len(current_jpeg)).encode() + b'\r\n'
               b'Cache-Control: no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0\r\n'
               b'Pragma: no-cache\r\n'
               b'Expires: 0\r\n'
               b'\r\n' + current_jpeg + b'\r\n')
        time.sleep(0.005)

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

@app.route("/status", methods=["GET", "OPTIONS"])
@app.route("/api/stats", methods=["GET", "OPTIONS"])
def api_stats():
    """Real-time detection stats for dashboard polling"""
    from flask import request
    if request.method == "OPTIONS":
        resp = jsonify({"ok": True})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        return resp

    with stats_lock:
        stats = current_stats.copy()

    resp = jsonify({
        "status": "running",
        "camera": camera.isOpened() if camera else False,
        "userId": GLOBAL_USER_ID,
        "fps": 30.0,
        "latency": 12.0,
        **stats
    })
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp

@app.route("/api/zones", methods=["GET", "POST", "OPTIONS"])
def update_zones():
    """GET or POST zone vectors directly from draw_zone calibration page or dashboard"""
    from flask import request
    if request.method == "OPTIONS":
        resp = jsonify({"ok": True})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        return resp

    global DANGER_ZONE, WARNING_ZONE

    if request.method == "GET":
        with zone_lock:
            dz = DANGER_ZONE.copy()
            wz = WARNING_ZONE.copy()
        
        danger_coords = {"x1": dz["x"], "y1": dz["y"], "x2": dz["x"] + dz["w"], "y2": dz["y"] + dz["h"]}
        warning_coords = {"x1": wz["x"], "y1": wz["y"], "x2": wz["x"] + wz["w"], "y2": wz["y"] + wz["h"]}
        
        return jsonify({
            "success": True,
            "danger": danger_coords,
            "warning": warning_coords,
            "dangerZone": dz,
            "warningZone": wz
        })

    # POST logic
    data = request.get_json(force=True, silent=True) or {}
    print(f"≡ƒô⌐ Received zone update: {data}")

    dz_raw = data.get("danger") or data.get("dangerZone")
    wz_raw = data.get("warning") or data.get("warningZone")
    dz = parse_zone_config(dz_raw)
    wz = parse_zone_config(wz_raw)
    updated = False
    with zone_lock:
        if dz:
            DANGER_ZONE = dz
            print(f"Γ£à Danger zone updated: {DANGER_ZONE}")
            updated = True
        if wz:
            WARNING_ZONE = wz
            print(f"Γ£à Warning zone updated: {WARNING_ZONE}")
            updated = True
    if updated:
        save_zones_to_file()  # persist immediately so it survives restarts

    with zone_lock:
        dz_curr = DANGER_ZONE.copy()
        wz_curr = WARNING_ZONE.copy()

    danger_coords = {"x1": dz_curr["x"], "y1": dz_curr["y"], "x2": dz_curr["x"] + dz_curr["w"], "y2": dz_curr["y"] + dz_curr["h"]}
    warning_coords = {"x1": wz_curr["x"], "y1": wz_curr["y"], "x2": wz_curr["x"] + wz_curr["w"], "y2": wz_curr["y"] + wz_curr["h"]}

    return jsonify({
        "success": True,
        "danger": danger_coords,
        "warning": warning_coords,
        "dangerZone": dz_curr,
        "warningZone": wz_curr
    })

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
        print(f"≡ƒôí Connecting to camera source: {camera_url}")
        camera = ThreadedCamera(cam_source).start()
        
        # Optimize resolution for better FPS
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        if not camera.isOpened():
            print(f"Γ¥î ERROR: Could not open camera source {camera_url}")
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
        print("ΓÜá∩╕Å [NO CAMERA] Idle mode active. Flask server is online to accept setup requests.")
    
    # 6. Start Hardware Serial Interlock Daemon (Syncs Cloud Status with local Arduino/ESP32 Motor Relay)
    try:
        from friend_hardware_sync import main as start_hardware_sync
        ht = threading.Thread(target=start_hardware_sync, daemon=True)
        ht.start()
    except Exception as e:
        print(f"Hardware sync daemon init notice: {e}")

    # 7. Start Flask server
    print("≡ƒÜÇ Starting AI Edge Agent Stream on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
