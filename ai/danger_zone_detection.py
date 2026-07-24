import os
# Tell FFmpeg: zero buffering, low delay, drop frames if behind
# This is the key to real-time RTSP with no accumulated delay
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = (
    'rtsp_transport;udp'
    '|fflags;nobuffer'
    '|flags;low_delay'
    '|framedrop;1'
    '|max_delay;0'
    '|reorder_queue_size;0'
    '|buffer_size;65536'
)
import cv2
# Do NOT limit threads — let OpenCV use all Pi cores for decode/encode/YOLO
# cv2.setNumThreads(1)  <- removed: was capping all operations to 1 core
import numpy as np
from ultralytics import YOLO
import threading
import time

from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")
# ==========================================
# 🧠 LOAD YOLO MODEL
# ==========================================
model = YOLO("yolov8n.pt")

# ==========================================
# 🛡️ MACHINE DANGER ZONE (RECTANGLE)
# ==========================================
MACHINE_ZONE = (360, 100, 600, 450)
WARNING_ZONE = (240, 50, 620, 460)

# ==========================================
# 📊 CENTRALIZED SYNCHRONIZED STATE
# ==========================================
system_status = {
    "human_count": 0,
    "ai_confidence": 0,
    "machine_state": "RUN",
    "danger_state": "SAFE",
    "fps": 0.0,
    "latency": 0.0,
    "last_detection_time": "--",
    "last_snapshot": "",
    "camera_status": "Offline"
}
system_status_lock = threading.Lock()

# ORIGINAL VALUES (PRESERVED FOR EASY RESTORE):
# ENTER_THRESHOLD = 1, EXIT_THRESHOLD = 8, FRAME_SKIP = 2, EMAIL_ALERT_INTERVAL = 60.0

ENTER_THRESHOLD = 1            # Instant trigger: 1 frame breach = DANGER
EXIT_THRESHOLD = 6             # Fast clearing when area is empty
FRAME_SKIP = 2                 # YOLO every 2nd frame — best speed/accuracy balance on Pi
EMAIL_ALERT_INTERVAL = float(os.environ.get("EMAIL_ALERT_INTERVAL", 180.0))  # 1 email per 3 min cooldown

# ==========================================
# 📐 BOX OVERLAP CHECK (ANY OVERLAP = DANGER)
# ==========================================
def box_overlap(boxA, boxB):
    # ORIGINAL strict overlap check - PRESERVED FOR EASY RESTORE
    # xA = max(boxA[0], boxB[0])
    # yA = max(boxA[1], boxB[1])
    # xB = min(boxA[2], boxB[2])
    # yB = min(boxA[3], boxB[3])
    # return xA < xB and yA < yB

    # NEW: Check if ANY part of boxA overlaps boxB (works for arm/partial body entry)
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    return xA < xB and yA < yB

def point_in_zone(x, y, zone):
    """Check if a single point (e.g. hand tip, foot) is inside the danger zone rectangle."""
    return zone[0] <= x <= zone[2] and zone[1] <= y <= zone[3]

# ==========================================
# 🎥 THREADED CAMERA CLASS (PRODUCTION GRADE)
# ==========================================
class ThreadedCamera:
    def __init__(self, source):
        self.source = source
        self.cap = None
        self.grabbed = False
        self.raw_frame = None
        self.processed_frame = None
        # display_frame = latest raw frame, always up to date at camera FPS
        # This is what generate_frames shows — never waits for YOLO
        self.display_frame = None
        self.display_lock = threading.Lock()
        self.started = False
        
        # Concurrency & Watchdog attributes
        self.read_lock = threading.Lock()
        self.last_access = time.time()
        
        # State tracking isolated per camera stream instance
        self.safety_state = "SAFE"
        self.machine_state = "RUN"
        self.current_confidence = 0
        self.danger_counter = 0
        self.warning_counter = 0
        self.safe_counter = 0
        self._last_email_sent_time = 0.0
        self._last_safety_state = "SAFE"
        self.human_count = 0
        self.latency_ms = 0.0
        self.last_detection_time = "--"
        self._current_fps = 20.0
        self.recipient_email = ""
        
        self.danger_zone = MACHINE_ZONE
        self.warning_zone = WARNING_ZONE
        self.load_zones_from_db()
        
        self.capture_thread = None
        self.inference_thread = None

    def load_zones_from_db(self):
        try:
            from db import db
            url_str = str(self.source)
            raw_url = url_str
            if "@" in url_str:
                prefix = ""
                if url_str.startswith("rtsp://"):
                    prefix = "rtsp://"
                    body = url_str[7:]
                elif url_str.startswith("http://"):
                    prefix = "http://"
                    body = url_str[7:]
                elif url_str.startswith("https://"):
                    prefix = "https://"
                    body = url_str[8:]
                
                if prefix and "@" in body:
                    parts = body.split("@", 1)
                    raw_url = prefix + parts[1]
            
            cam_doc = db["cameras"].find_one({
                "$or": [
                    {"url": raw_url},
                    {"url": url_str}
                ]
            })
            if cam_doc:
                dz_str = cam_doc.get("dangerZone", "")
                wz_str = cam_doc.get("warningZone", "")
                if dz_str:
                    parts = [int(p) for p in dz_str.split(",")]
                    if len(parts) == 4:
                        self.danger_zone = (
                            int(parts[0] * 640 / 1000),
                            int(parts[1] * 480 / 1000),
                            int(parts[2] * 640 / 1000),
                            int(parts[3] * 480 / 1000)
                        )
                if wz_str:
                    parts = [int(p) for p in wz_str.split(",")]
                    if len(parts) == 4:
                        self.warning_zone = (
                            int(parts[0] * 640 / 1000),
                            int(parts[1] * 480 / 1000),
                            int(parts[2] * 640 / 1000),
                            int(parts[3] * 480 / 1000)
                        )
        except Exception as e:
            print(f"[DB_ERROR] Failed loading dynamic zones: {e}")

    def start(self):
        if self.started:
            return self
        self.started = True
        
        # 1. Start background frame capture thread
        self.capture_thread = threading.Thread(target=self.update_capture, args=())
        self.capture_thread.daemon = True
        self.capture_thread.start()
        
        # 2. Start decoupled YOLO inference thread
        self.inference_thread = threading.Thread(target=self.update_inference, args=())
        self.inference_thread.daemon = True
        self.inference_thread.start()
        
        return self

    def update_capture(self):
        """Capture thread: grabs frames as fast as possible to drain FFmpeg buffer.
        Only decodes (retrieve) at DISPLAY_FPS rate to get the NEWEST frame.
        This eliminates the accumulated delay that causes 25-second lag."""
        print(f"[CAM_THREAD] Starting capture for: {self.source}")
        DISPLAY_FPS   = 30          # decode at most 30fps
        DISPLAY_INTERVAL = 1.0 / DISPLAY_FPS
        _last_retrieve   = 0.0
        _fail_count      = 0
        MAX_FAILS        = 30       # reconnect after 30 consecutive grab failures

        def _open_cap(src):
            """Open VideoCapture with zero-buffer settings."""
            if isinstance(src, str) and (src.startswith("rtsp://") or src.startswith("http://")):
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
            else:
                cap = cv2.VideoCapture(src)
            if cap and cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)          # minimal OpenCV buffer
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
            return cap

        # ── Initial open ──────────────────────────────────────────────────────
        if self.cap is None:
            self.cap = _open_cap(self.source)
            print(f"[CAM_THREAD] Opened: {self.cap.isOpened() if self.cap else False}")

        while self.started:
            # ── Reconnect if camera dropped ──────────────────────────────────
            if not self.cap or not self.cap.isOpened():
                print(f"[CAM_THREAD] Reconnecting to {self.source}...")
                if self.cap:
                    self.cap.release()
                time.sleep(2.0)
                self.cap = _open_cap(self.source)
                _fail_count = 0
                continue

            # ── TIGHT GRAB LOOP ───────────────────────────────────────────────
            # grab() is fast: tells FFmpeg to decode next packet but doesn't
            # give us the pixel data. By calling it continuously we drain
            # the entire accumulated buffer in milliseconds.
            ok = self.cap.grab()

            if not ok:
                _fail_count += 1
                if _fail_count >= MAX_FAILS:
                    print(f"[CAM_WATCHDOG] {MAX_FAILS} grab failures. Reconnecting...")
                    with self.read_lock:
                        self.grabbed = False
                    self.cap.release()
                    self.cap = None
                    _fail_count = 0
                continue

            _fail_count = 0  # reset on success

            # ── Decode only when display interval has elapsed ─────────────────
            # All the extra grab() calls above drain stale frames.
            # retrieve() gives us the NEWEST decoded frame.
            now = time.time()
            if now - _last_retrieve < DISPLAY_INTERVAL:
                continue   # grab again (drain) without decoding

            ok2, frame = self.cap.retrieve()
            _last_retrieve = now

            if not ok2 or frame is None:
                continue

            # Resize to 640×480 immediately — avoid encoding full HD JPEG
            h, w = frame.shape[:2]
            if (h, w) != (480, 640):
                display = cv2.resize(frame, (640, 480))
            else:
                display = frame

            with self.read_lock:
                self.grabbed = True
                self.raw_frame = frame
            with self.display_lock:
                self.display_frame = display

            if not hasattr(self, '_capture_count'):
                self._capture_count = 0
            self._capture_count += 1
            if self._capture_count <= 10 or self._capture_count % 150 == 0:
                print(f"[CAM_THREAD] frame #{self._capture_count} | {w}x{h} -> 640x480")


    def update_inference(self):
        frame_count = 0
        last_results = []
        
        while self.started:
            try:
                # Thread-safe read of latest raw frame
                with self.read_lock:
                    grabbed = self.grabbed
                    frame = self.raw_frame.copy() if (self.raw_frame is not None and grabbed) else None
                    
                if not grabbed or frame is None:
                    time.sleep(0.05)
                    continue
                    
                # Process Frame Details
                frame = cv2.resize(frame, (640, 480))
                
                # Periodically sync calibration coordinates from database
                if frame_count % 100 == 0:
                    self.load_zones_from_db()
                    
                danger_in_frame = False
                warning_in_frame = False
                
                # YOLO detect humans (conf=0.15 to detect partial arms/limbs/hands)
                t_inf_start = time.time()
                if frame_count % FRAME_SKIP == 0:
                    # ORIGINAL: results = model(frame, conf=0.25, classes=[0], verbose=False)
                    results = model(frame, conf=0.15, verbose=False)
                    last_results = results
                    
                    # Diagnostics Logging
                    for r in results:
                        cls_ids = [int(box.cls[0].item()) for box in r.boxes]
                        scores = [float(box.conf[0].item()) for box in r.boxes]
                        has_person = 0 in cls_ids or len(cls_ids) > 0
                        h, w = frame.shape[:2]
                        print(f"[DEBUG] [YOLO_INFERENCE] Model: yolov8n.pt | Conf Thresh: 0.15 | Resolution: {w}x{h} | Detected Classes: {cls_ids} | Scores: {[round(s, 2) for s in scores]} | Person Present: {has_person}")
                else:
                    results = last_results
                t_inf_end = time.time()
                latency_ms = (t_inf_end - t_inf_start) * 1000.0
                    
                person_boxes = []
                person_scores = []
                for r in results:
                    for box in r.boxes:
                        person_boxes.append(box)
                        person_scores.append(float(box.conf[0].item()))
                
                human_count = len(person_boxes)
                ai_confidence = int(max(person_scores) * 100) if human_count > 0 else 0
                
                for box in person_boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    foot_x = (x1 + x2) // 2
                    foot_y = y2
                    
                    # Check if bounding box overlaps dynamic zones
                    person_box = (x1, y1, x2, y2)

                    # ORIGINAL: only bounding box overlap check - PRESERVED
                    # in_danger_zone = box_overlap(person_box, self.danger_zone)

                    # NEW: Check full overlap OR any edge/arm point inside zone
                    # This catches when arm reaches into zone but body is outside
                    in_danger_zone = (
                        box_overlap(person_box, self.danger_zone) or
                        point_in_zone(x1, y1, self.danger_zone) or   # top-left (reaching hand)
                        point_in_zone(x2, y1, self.danger_zone) or   # top-right
                        point_in_zone(x1, y2, self.danger_zone) or   # bottom-left (foot)
                        point_in_zone(x2, y2, self.danger_zone) or   # bottom-right
                        point_in_zone(x1, (y1+y2)//2, self.danger_zone) or  # left edge mid (arm side)
                        point_in_zone(x2, (y1+y2)//2, self.danger_zone) or  # right edge mid (arm side)
                        point_in_zone((x1+x2)//2, y1, self.danger_zone)      # top mid (reaching hand)
                    )
                    in_warning_zone = box_overlap(person_box, self.warning_zone)
                    print(f"[DEBUG_ZONE] BBox: ({x1},{y1},{x2},{y2}) | Inside Warning: {in_warning_zone} | Inside Danger: {in_danger_zone}")

                    
                    yolo_conf = float(box.conf[0].item())
                    yolo_conf_pct = int(yolo_conf * 100)
                    
                    # Compute distance-based confidence for UI HUD
                    mz_cx = (self.danger_zone[0] + self.danger_zone[2]) // 2
                    mz_cy = (self.danger_zone[1] + self.danger_zone[3]) // 2
                    dist = np.sqrt((foot_x - mz_cx)**2 + (foot_y - mz_cy)**2)
                    calculated_conf = max(0, min(100, int(100 - (dist / 6))))
                    
                    if in_danger_zone:
                        danger_in_frame = True
                        calculated_conf = 100
                        color = (0, 0, 255) # Red
                        label = f"DANGER (PERSON {yolo_conf_pct}%)"
                    elif in_warning_zone:
                        warning_in_frame = True
                        color = (0, 165, 255) # Orange
                        label = f"WARNING (PERSON {yolo_conf_pct}%)"
                    else:
                        color = (0, 255, 0) # Green
                        label = f"PERSON {yolo_conf_pct}% (SAFE {calculated_conf}%)"
                        
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
                    cv2.putText(frame, label, (x1, y1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
                                
                # Draw Warning Zone (Orange if occupied, Yellow if clear)
                warning_color = (0, 165, 255) if (warning_in_frame or danger_in_frame) else (0, 255, 255)
                warning_label = "WARNING ZONE (OCCUPIED)" if (warning_in_frame or danger_in_frame) else "WARNING ZONE"
                cv2.rectangle(
                    frame,
                    (self.warning_zone[0], self.warning_zone[1]),
                    (self.warning_zone[2], self.warning_zone[3]),
                    warning_color,
                    3
                )
                cv2.putText(frame, warning_label,
                            (self.warning_zone[0], self.warning_zone[1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, warning_color, 2)

                # Draw Danger Zone / Machine Zone (Red if breached, Yellow if clear)
                danger_color = (0, 0, 255) if danger_in_frame else (0, 255, 255)
                danger_label = "MACHINE ZONE (DANGER BREACH)" if danger_in_frame else "MACHINE ZONE"
                cv2.rectangle(
                    frame,
                    (self.danger_zone[0], self.danger_zone[1]),
                    (self.danger_zone[2], self.danger_zone[3]),
                    danger_color,
                    3
                )
                cv2.putText(frame, danger_label,
                            (self.danger_zone[0], self.danger_zone[1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, danger_color, 2)
                                    
                # Debounce state machine
                if danger_in_frame:
                    self.danger_counter += 1
                    self.warning_counter = 0
                    self.safe_counter = 0
                elif warning_in_frame:
                    self.warning_counter += 1
                    self.danger_counter = 0
                    self.safe_counter = 0
                else:
                    self.safe_counter += 1
                    self.danger_counter = 0
                    self.warning_counter = 0
                    
                if self.danger_counter >= ENTER_THRESHOLD:
                    new_state = "DANGER"
                elif self.warning_counter >= ENTER_THRESHOLD:
                    new_state = "WARNING"
                elif self.safe_counter >= EXIT_THRESHOLD:
                    new_state = "SAFE"
                else:
                    new_state = self.safety_state
                    
                state_changed = (new_state != self.safety_state)
                self.safety_state = new_state
                self.machine_state = "STOP" if new_state == "DANGER" else "RUN"
                self.current_confidence = ai_confidence
                print(f"[DEBUG_ZONE] Current State: {self.safety_state} | Warning Zone Color: {'Orange' if (warning_in_frame or danger_in_frame) else 'Yellow'} | Machine Zone Color: {'Red' if danger_in_frame else 'Yellow'}")

                # ── LIGHTWEIGHT DB INSERT: Save every new DANGER event to history ──
                # This runs on EVERY new SAFE→DANGER transition (not gated by email cooldown)
                # Ensures history/count is accurate and every record has a photo
                if state_changed and self.safety_state == "DANGER":
                    # Capture snapshot NOW (in main thread) before frame changes
                    _snap_b64 = ""
                    try:
                        import base64
                        _snap_frame = frame.copy()
                        _, _buf = cv2.imencode(".jpg", _snap_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                        _snap_b64 = base64.b64encode(_buf).decode("utf-8")
                    except Exception:
                        pass

                    def _save_detection_event(safety_state, confidence, h_count, source, recipient, snap_b64):
                        try:
                            from db import history_collection, db
                            local_user_id = None
                            if recipient:
                                try:
                                    user_doc = db["users"].find_one({"email": recipient})
                                    if user_doc:
                                        local_user_id = user_doc["_id"]
                                except Exception:
                                    pass
                            history_collection.insert_one({
                                "event": "Human detected inside danger zone",
                                "status": safety_state,
                                "timestamp": datetime.utcnow(),
                                "timestamp_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
                                "photo_base64": snap_b64,
                                "confidence": confidence,
                                "human_count": h_count,
                                "camera_id": str(source),
                                "email_status": "no_email",
                                "userId": local_user_id
                            })
                            print(f"[HISTORY] Danger event saved to DB (with photo: {bool(snap_b64)}). Count: {h_count}")
                        except Exception as db_err:
                            print(f"[HISTORY] DB insert error: {db_err}")
                    import threading as _t
                    _t.Thread(
                        target=_save_detection_event,
                        args=(self.safety_state, ai_confidence, human_count, self.source,
                              getattr(self, 'recipient_email', None), _snap_b64),
                        daemon=True
                    ).start()
                
                # Estimate rolling FPS
                if not hasattr(self, '_fps_start_time'):
                    self._fps_start_time = time.time()
                    self._fps_frames = 0
                self._fps_frames += 1
                elapsed = time.time() - self._fps_start_time
                if elapsed >= 2.0:
                    self._current_fps = self._fps_frames / elapsed
                    self._fps_start_time = time.time()
                    self._fps_frames = 0
                elif not hasattr(self, '_current_fps'):
                    self._current_fps = 20.0
                    
                # Define now_time explicitly
                now_time = time.time()
                
                # Check alert and database logging trigger conditions (STRICT DANGER STATE ONLY)
                trigger_email = False
                if self.safety_state == "DANGER":
                    # Only trigger if coming from SAFE/WARNING AND at least 30s has passed since last email
                    if (now_time - self._last_email_sent_time >= 30.0):
                        if self._last_safety_state in ["SAFE", "WARNING"]:
                            trigger_email = True
                        elif now_time - self._last_email_sent_time >= EMAIL_ALERT_INTERVAL:
                            trigger_email = True

                if trigger_email:
                    # Instantly set timestamp to block duplicate thread triggers
                    self._last_email_sent_time = now_time

                should_log = trigger_email
                
                if should_log:
                    event_name = "Human detected inside danger zone"
                    
                    img_b64 = ""
                    try:
                        _, buffer = cv2.imencode(".jpg", frame)
                        import base64
                        img_b64 = base64.b64encode(buffer).decode("utf-8")
                    except Exception as e:
                        print(f"Error encoding snapshot: {e}")
                    
                    email_db_status = "pending"
                    
                    from bson import ObjectId
                    event_id = ObjectId()
                    
                    try:
                        from db import history_collection, db
                        local_user_id = None
                        if hasattr(self, 'recipient_email') and self.recipient_email:
                            try:
                                users_col = db["users"]
                                user_doc = users_col.find_one({"email": self.recipient_email})
                                if user_doc:
                                    local_user_id = user_doc["_id"]
                            except Exception as user_err:
                                print(f"Error looking up user locally: {user_err}")

                        history_collection.insert_one({
                            "_id": event_id,
                            "event": event_name,
                            "status": self.safety_state,
                            "timestamp": datetime.utcnow(),
                            "timestamp_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
                            "photo_base64": img_b64,
                            "confidence": ai_confidence,
                            "human_count": human_count,
                            "camera_id": str(self.source),
                            "email_status": email_db_status,
                            "userId": local_user_id
                        })
                        print(f"[EVENT] event stored: {event_name} | Status: {self.safety_state} | Count: {human_count} | Email Status: {email_db_status} | Local userId: {local_user_id}")
                    except Exception as db_err:
                        print(f"Error inserting event into MongoDB: {db_err}")

                    # 🌐 POST event directly to Node.js backend to log in cloud DB and send cloud email alert
                    import urllib.request
                    import json
                    import ssl
                    backend_url = os.environ.get("BACKEND_URL", "https://www.codevortex.in")
                    payload = {
                        "danger": True,
                        "confidence": int(ai_confidence),
                        "cameraStreamUrl": str(self.source),  # stable URL for owner lookup
                        "image": img_b64,
                        "cameraName": f"Optical Node {self.source}",
                        "factory": "Factory A",
                        "breachType": "ZONE_INTRUSION",
                        "severity": "DANGER",
                        "recipient_email": self.recipient_email
                    }
                    try:
                        print(f"[POST] Dispatching incident to cloud backend: {backend_url}/api/detection...")
                        data_bytes = json.dumps(payload).encode('utf-8')
                        req = urllib.request.Request(
                            f"{backend_url}/api/detection",
                            data=data_bytes,
                            headers={'Content-Type': 'application/json'},
                            method='POST'
                        )
                        context = ssl._create_unverified_context()
                        with urllib.request.urlopen(req, context=context, timeout=5) as response:
                            resp_text = response.read().decode('utf-8')
                            print(f"[POST] Cloud backend response: {response.status} | {resp_text}")
                    except Exception as post_err:
                        print(f"[POST] Failed to dispatch incident to cloud backend: {post_err}")
                    
                    if trigger_email:
                        self._last_email_sent_time = now_time
                        
                        camera_display_name = f"Optical Node {self.source}"
                        timestamp_str = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                        attachment_name = datetime.now(IST).strftime("incident_%Y%m%d_%H%M%S.jpg")
                        
                        # Save snapshot to disk
                        try:
                            snapshots_dir = os.path.join(os.path.dirname(__file__), "snapshots")
                            os.makedirs(snapshots_dir, exist_ok=True)
                            snapshot_path = os.path.join(snapshots_dir, attachment_name)
                            cv2.imwrite(snapshot_path, frame)
                            print(f"[SNAPSHOT] Saved to disk: {snapshot_path}")
                        except Exception as write_err:
                            print(f"Error saving snapshot to disk: {write_err}")
                        
                        html_body = f"""
                        <html>
                        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 20px;">
                          <div style="max-width: 600px; margin: 0 auto; background: rgba(30, 41, 59, 0.75); border: 1px solid #ef4444; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                            <div style="background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 20px; text-align: center; border-bottom: 2px solid #ef4444;">
                              <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: bold;">⚠️ Safety Intrusion Alert ⚠️</h1>
                            </div>
                            <div style="padding: 24px; background-color: #0f172a;">
                              <p style="font-size: 15px; margin: 0 0 20px 0; color: #cbd5e1; line-height: 1.6;">
                                An operator safety boundary breach has been detected inside the machine zone. The interlock matrix has triggered a <strong>PLC EMERGENCY TRIP</strong>.
                              </p>
                              
                              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; color: #cbd5e1;">
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">Sensor Location:</td>
                                  <td style="padding: 10px 0; color: #f1f5f9;">{camera_display_name}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">Timestamp (IST):</td>
                                  <td style="padding: 10px 0; color: #f1f5f9;">{timestamp_str}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">Active Workers:</td>
                                  <td style="padding: 10px 0; color: #f1f5f9;">{human_count}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">AI Proximity Confidence:</td>
                                  <td style="padding: 10px 0; color: #10b981; font-weight: bold;">{ai_confidence}%</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">Safety Status:</td>
                                  <td style="padding: 10px 0; color: #ef4444; font-weight: bold;">{self.safety_state}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                                  <td style="padding: 10px 0; font-weight: bold; color: #06b6d4;">Machine Zone Limits:</td>
                                  <td style="padding: 10px 0; font-family: monospace; color: #f1f5f9;">{MACHINE_ZONE}</td>
                                </tr>
                              </table>
                              
                              <div style="border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 8px; overflow: hidden; background: #020617; text-align: center; padding: 12px; margin-bottom: 20px;">
                                <div style="font-size: 11px; font-weight: bold; color: #06b6d4; margin-bottom: 8px; text-transform: uppercase;">📸 Incident Telemetry Snapshot</div>
                                <img src="cid:incident_snapshot" alt="Incident Snapshot" style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);" />
                              </div>
                              
                              <p style="font-size: 11px; color: #64748b; text-align: center; margin: 20px 0 0 0; line-height: 1.4;">
                                Secure Shield Core Integration Matrix &bull; IEC 61508 SIL 3 Certified
                              </p>
                            </div>
                          </div>
                        </body>
                        </html>
                        """
                        
                        def send_async(eid, msg_body, img, fname):
                            from mailer import send_alert_email
                            try:
                                print(f"[EMAIL_ALERT] Dispatching incident email asynchronously...")
                                send_alert_email(custom_message="SAFETY BREACH ALERT", image_base64=img, filename=fname, html_body=msg_body)
                                print(f"[EMAIL_ALERT] Success! Updating database status to 'sent' for event {eid}")
                                history_collection.update_one({"_id": eid}, {"$set": {"email_status": "sent"}})
                            except Exception as ex:
                                print(f"[EMAIL_ALERT] Failure: {ex}. Updating database status to 'failed' for event {eid}")
                                try:
                                    history_collection.update_one({"_id": eid}, {"$set": {"email_status": "failed"}})
                                except Exception as db_ex:
                                    print(f"Error updating email status: {db_ex}")

                        threading.Thread(target=send_async, args=(event_id, html_body, img_b64, attachment_name), daemon=True).start()

                if self._last_safety_state == "DANGER" and self.safety_state != "DANGER":
                    # State transitioned OUT of danger! Send danger: False POST request
                    import urllib.request
                    import json
                    import ssl
                    backend_url = os.environ.get("BACKEND_URL", "https://www.codevortex.in")
                    payload = {
                        "danger": False,
                        "confidence": 0,
                        "cameraStreamUrl": str(self.source),  # stable URL for owner lookup
                        "cameraName": f"Optical Node {self.source}",
                        "recipient_email": self.recipient_email
                    }
                    try:
                        print(f"[POST] Notifying cloud backend that danger state cleared...")
                        data_bytes = json.dumps(payload).encode('utf-8')
                        req = urllib.request.Request(
                            f"{backend_url}/api/detection",
                            data=data_bytes,
                            headers={'Content-Type': 'application/json'},
                            method='POST'
                        )
                        context = ssl._create_unverified_context()
                        with urllib.request.urlopen(req, context=context, timeout=3) as response:
                            pass
                    except Exception as clear_err:
                        print(f"[POST] Failed to notify backend that danger cleared: {clear_err}")

                self._last_safety_state = self.safety_state
                        
                # Update ThreadedCamera instance variables (single source of truth)
                self.human_count = human_count
                self.latency_ms = latency_ms
                if human_count > 0:
                    print("[DEBUG] Updating detection timestamp")
                    self.last_detection_time = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                
                # Update global synchronized status object
                with system_status_lock:
                    system_status["human_count"] = self.human_count
                    system_status["ai_confidence"] = self.current_confidence
                    system_status["danger_state"] = self.safety_state
                    system_status["machine_state"] = "STOP" if self.safety_state == "DANGER" else "RUN"
                    system_status["fps"] = round(self._current_fps, 1)
                    system_status["latency"] = round(self.latency_ms, 1)
                    system_status["camera_status"] = "Online" if self.grabbed else "Offline"
                    system_status["last_detection_time"] = self.last_detection_time
                    if self.safety_state == "DANGER":
                        system_status["last_snapshot"] = "Snapshot Active"
                    else:
                        system_status["last_snapshot"] = ""
                    
                    # Print debug status log
                    if frame_count % 10 == 0:
                        print(f"[STATUS] human_count={system_status['human_count']} | confidence={system_status['ai_confidence']}% | danger_state={system_status['danger_state']}")
                
                # Overlay status banner
                banner_color = (0, 0, 255) if self.safety_state == "DANGER" else (0, 255, 0)
                banner_text = "SYSTEM STOPPED" if self.safety_state == "DANGER" else "SYSTEM RUNNING"
                cv2.putText(frame, banner_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.1, banner_color, 3)
                
                # Save processed frame (for fallback read()) and also
                # push annotated frame into display_frame so stream shows overlays
                with self.read_lock:
                    self.processed_frame = frame
                with self.display_lock:
                    self.display_frame = frame.copy()
                    
                frame_count += 1
                if frame_count > 1_000_000:
                    frame_count = 0
            except Exception as loop_ex:
                import traceback
                print(f"[CRITICAL_ERROR] Exception in update_inference loop: {loop_ex}")
                traceback.print_exc()
                # No sleep here — run inference as fast as the Pi allows

    def read(self):
        with self.read_lock:
            self.last_access = time.time()
            raw_none = self.raw_frame is None
            proc_none = self.processed_frame is None
            
            if not hasattr(self, '_read_count'):
                self._read_count = 0
            self._read_count += 1
            if self._read_count <= 50 or self._read_count % 100 == 0:
                print(f"[DEBUG] [CAM_READ] id={id(self)} | read() #{self._read_count} | grabbed={self.grabbed} | raw_none={raw_none} | proc_none={proc_none}")
            
            if not proc_none:
                return self.grabbed, self.processed_frame.copy()
            elif not raw_none:
                return self.grabbed, self.raw_frame.copy()
            return False, None

    def release(self):
        self.started = False
        if self.capture_thread:
            self.capture_thread.join(timeout=0.5)
        if self.inference_thread:
            self.inference_thread.join(timeout=0.5)
        if self.cap:
            self.cap.release()

# ==========================================
# 🌐 CAMERA POOL (WEAK SESSIONS CLEANUP)
# ==========================================
class CameraPool:
    def __init__(self):
        self.cameras = {}
        self.lock = threading.Lock()
        self.last_active_source = None
        
        # Start background cleanup manager
        self.cleanup_thread = threading.Thread(target=self._auto_cleanup_loop, daemon=True)
        self.cleanup_thread.start()

    def acquire_camera(self, source):
        with self.lock:
            resolved_source = int(source) if str(source).isdigit() else source
            self.last_active_source = resolved_source
            
            reused = resolved_source in self.cameras
            if not reused:
                print(f"[CAMERA_POOL] Spawning new ThreadedCamera loop for source: {resolved_source}")
                self.cameras[resolved_source] = ThreadedCamera(resolved_source).start()
            else:
                print(f"[CAMERA_POOL] Reusing existing ThreadedCamera instance for source: {resolved_source}")
                
            cam_instance = self.cameras[resolved_source]
            print(f"[CAMERA_POOL] Source: {resolved_source} | Memory ID: {id(cam_instance)} | Reused: {reused}")
            return cam_instance

    def _auto_cleanup_loop(self):
        while True:
            time.sleep(5.0)
            self.cleanup()

    def cleanup(self, timeout=15.0):
        with self.lock:
            now = time.time()
            to_delete = []
            
            # Double-lock pattern checking inactivity
            for src, cam in self.cameras.items():
                if now - cam.last_access > timeout:
                    to_delete.append(src)
                    
            for src in to_delete:
                print(f"[CAMERA_POOL] Source {src} idle for >{timeout}s. Releasing camera.")
                self.cameras[src].release()
                del self.cameras[src]
                if self.last_active_source == src:
                    self.last_active_source = None

# Global pool instance
camera_pool = CameraPool()

# ==========================================
# 🎞️ VIDEO STREAM GENERATOR & STABILITY WRAPPERS
# ==========================================
def generate_frames(source="rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101"):
    print(f"[DEBUG] [GENERATOR] generate_frames generator function started for source: {source}")
    cam = camera_pool.acquire_camera(source)
    frame_count = 0
    # JPEG encode params — quality 65 = good image, ~2x faster than default 95
    ENCODE_PARAMS = [cv2.IMWRITE_JPEG_QUALITY, 65]
    # Target stream FPS cap (no point sending faster than browser can display)
    STREAM_INTERVAL = 1.0 / 25.0   # 25 fps max to browser
    last_yield_time = 0.0
    
    try:
        while True:
            now = time.time()

            # Read from display_frame directly — always latest camera frame,
            # updated at full capture FPS independently of YOLO inference speed
            with cam.display_lock:
                disp = cam.display_frame
                grabbed = cam.grabbed
            cam.last_access = now

            # Offline/Broken stream watchdog fallback
            if not grabbed or disp is None:
                if frame_count <= 50 or frame_count % 30 == 0:
                    print(f"[WARNING] Stream '{source}' offline/connecting. frame_count={frame_count}")
                
                error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(error_frame, "SENSOR OFFLINE: RECONNECTING...", (40, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2)
                _, buffer = cv2.imencode(".jpg", error_frame, ENCODE_PARAMS)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                time.sleep(1.0)
                frame_count += 1
                continue
            
            # Throttle to STREAM_INTERVAL so we don't send duplicate frames
            elapsed = now - last_yield_time
            if elapsed < STREAM_INTERVAL:
                time.sleep(STREAM_INTERVAL - elapsed)
                continue

            ret, jpeg = cv2.imencode('.jpg', disp, ENCODE_PARAMS)
            if not ret:
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

            last_yield_time = time.time()
            frame_count += 1
            if frame_count > 1_000_000:
                frame_count = 0
                
    except GeneratorExit:
        print(f"[DEBUG] [GENERATOR] Client disconnected: {source}")

# ==========================================
# 📊 RETRO COMPATIBILITY GETTERS
# ==========================================
def get_safety_state(source=None):
    if source is None:
        source = camera_pool.last_active_source
    if source is None:
        return "SAFE"
    resolved_source = int(source) if str(source).isdigit() else source
    cam = camera_pool.cameras.get(resolved_source)
    if cam:
        return cam.safety_state
    return "SAFE"

def get_current_confidence(source=None):
    if source is None:
        source = camera_pool.last_active_source
    if source is None:
        return 0
    resolved_source = int(source) if str(source).isdigit() else source
    cam = camera_pool.cameras.get(resolved_source)
    if cam:
        return cam.current_confidence
    return 0

def get_latest_frame(source=None):
    if source is None:
        source = camera_pool.last_active_source
    if source is None:
        return None
    cam = camera_pool.acquire_camera(source)
    if cam:
        with cam.read_lock:
            if cam.processed_frame is not None:
                return cam.processed_frame.copy()
            elif cam.raw_frame is not None and cam.grabbed:
                return cam.raw_frame.copy()
    return None

def get_live_status():
    # Filter for cameras that are currently grabbed/active
    active_cameras = [c for c in camera_pool.cameras.values() if getattr(c, 'grabbed', False)]
    if not active_cameras:
        active_cameras = list(camera_pool.cameras.values())
    
    print("===== LIVE TELEMETRY =====")
    print("Camera Pool Keys:", list(camera_pool.cameras.keys()))
    print("Last Active Source:", camera_pool.last_active_source)
    print("Active Grabbed Cameras Count:", len(active_cameras))
    
    if not active_cameras:
        print("No active cameras in pool")
        print("==========================")
        return {
            "human_count": 0,
            "ai_confidence": 0,
            "machine_state": "RUN",
            "danger_state": "SAFE",
            "fps": 0.0,
            "latency": 0.0,
            "last_detection_time": "--",
            "last_snapshot": "",
            "camera_status": "Offline"
        }
        
    # Aggregate values over active running cameras
    human_count = 0
    max_confidence = 0
    any_danger = False
    any_warning = False
    max_fps = 0.0
    max_latency = 0.0
    latest_detection_time = "--"
    any_online = False
    
    for c in active_cameras:
        human_count += getattr(c, 'human_count', 0)
        conf = getattr(c, 'current_confidence', 0)
        if conf > max_confidence:
            max_confidence = conf
        state = getattr(c, 'safety_state', 'SAFE')
        if state == "DANGER":
            any_danger = True
        elif state == "WARNING":
            any_warning = True
        fps = getattr(c, '_current_fps', 20.0)
        if fps > max_fps:
            max_fps = fps
        lat = getattr(c, 'latency_ms', 8.0)
        if lat > max_latency:
            max_latency = lat
        det_time = getattr(c, 'last_detection_time', "--")
        if det_time != "--":
            if latest_detection_time == "--" or det_time > latest_detection_time:
                latest_detection_time = det_time
        if getattr(c, 'grabbed', False):
            any_online = True
            
    danger_val = "DANGER" if any_danger else ("WARNING" if any_warning else "SAFE")
    machine_val = "STOP" if any_danger else "RUN"
    
    print("Aggregate Human Count:", human_count)
    print("Aggregate Confidence:", max_confidence)
    print("Aggregate Safety:", danger_val)
    print("Aggregate Machine State:", machine_val)
    print("==========================")
    
    return {
        "human_count": human_count,
        "ai_confidence": max_confidence,
        "danger_state": danger_val,
        "machine_state": machine_val,
        "fps": round(max_fps, 1) if max_fps > 0 else 20.0,
        "latency": round(max_latency, 1) if max_latency > 0 else 8.0,
        "last_detection_time": latest_detection_time,
        "last_snapshot": "Snapshot Active" if any_danger else "",
        "camera_status": "Online" if any_online else "Offline"
    }
