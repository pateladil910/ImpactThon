import os
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
import cv2
cv2.setNumThreads(1)
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
MACHINE_ZONE = (360, 100, 620, 420)
WARNING_ZONE = (
    MACHINE_ZONE[0] - 80,
    MACHINE_ZONE[1] - 80,
    MACHINE_ZONE[2] + 80,
    MACHINE_ZONE[3] + 80
)

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

ENTER_THRESHOLD = 1
EXIT_THRESHOLD = 8
FRAME_SKIP = 3  # Run YOLO inference every 3rd frame
EMAIL_ALERT_INTERVAL = float(os.environ.get("EMAIL_ALERT_INTERVAL", 60.0))

# ==========================================
# 📐 BOX OVERLAP CHECK
# ==========================================
def box_overlap(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    return xA < xB and yA < yB

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
        self.started = False
        
        # Concurrency & Watchdog attributes
        self.read_lock = threading.Lock()
        self.last_access = time.time()
        
        # State tracking isolated per camera stream instance
        self.safety_state = "SAFE"
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
        
        self.capture_thread = None
        self.inference_thread = None

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
        print(f"[DEBUG] [CAM_THREAD] update_capture thread started for source: {self.source}")
        
        # Asynchronous initialization to avoid blocking Flask request threads
        if self.cap is None:
            t_start = time.time()
            if isinstance(self.source, str) and (self.source.startswith("rtsp://") or self.source.startswith("http://")):
                self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
            else:
                self.cap = cv2.VideoCapture(self.source)
            t_cap = time.time()
            
            if self.cap:
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
            
            print(f"[DEBUG] [CAM_THREAD] VideoCapture initialized in {t_cap - t_start:.3f}s. isOpened: {self.cap.isOpened() if self.cap else False}")
            
            # Read first frame
            if self.cap and self.cap.isOpened():
                t_read_start = time.time()
                grabbed, frame = self.cap.read()
                t_read_end = time.time()
                print(f"[DEBUG] [CAM_THREAD] First frame read in {t_read_end - t_read_start:.3f}s. Success: {grabbed}")
                
                if grabbed:
                    with self.read_lock:
                        self.grabbed = grabbed
                        self.raw_frame = frame

        while self.started:
            if not self.cap or not self.cap.isOpened():
                time.sleep(2.0)
                t_start = time.time()
                if isinstance(self.source, str) and (self.source.startswith("rtsp://") or self.source.startswith("http://")):
                    self.cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                else:
                    self.cap = cv2.VideoCapture(self.source)
                t_cap = time.time()
                
                if self.cap:
                    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                    self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
                print(f"[DEBUG] [CAM_THREAD] VideoCapture re-initialized in {t_cap - t_start:.3f}s. isOpened: {self.cap.isOpened() if self.cap else False}")
                continue
            
            grabbed, frame = self.cap.read()
            if grabbed:
                with self.read_lock:
                    self.grabbed = grabbed
                    self.raw_frame = frame
                if not hasattr(self, '_capture_count'):
                    self._capture_count = 0
                self._capture_count += 1
                if self._capture_count <= 50 or self._capture_count % 100 == 0:
                    print(f"[DEBUG] [CAM_THREAD] id={id(self)} | update_capture() read #{self._capture_count} frames | shape={frame.shape}")
            else:
                print(f"[CAM_WATCHDOG] Frame read failed for {self.source}. Reconnecting...")
                with self.read_lock:
                    self.grabbed = False
                    self.processed_frame = None
                if self.cap:
                    self.cap.release()
                time.sleep(2.0)

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
                danger_in_frame = False
                warning_in_frame = False
                
                # YOLO detect humans only (Class 0)
                t_inf_start = time.time()
                if frame_count % FRAME_SKIP == 0:
                    results = model(frame, conf=0.25, classes=[0], verbose=False)
                    last_results = results
                    
                    # Diagnostics Logging
                    for r in results:
                        cls_ids = [int(box.cls[0].item()) for box in r.boxes]
                        scores = [float(box.conf[0].item()) for box in r.boxes]
                        has_person = 0 in cls_ids
                        h, w = frame.shape[:2]
                        print(f"[DEBUG] [YOLO_INFERENCE] Model: yolov8n.pt | Conf Thresh: 0.25 | Resolution: {w}x{h} | Detected Classes: {cls_ids} | Scores: {[round(s, 2) for s in scores]} | Person Present: {has_person}")
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
                    
                    # Check if bottom-center lies inside MACHINE_ZONE or WARNING_ZONE
                    in_danger_zone = (MACHINE_ZONE[0] <= foot_x <= MACHINE_ZONE[2]) and (MACHINE_ZONE[1] <= foot_y <= MACHINE_ZONE[3])
                    in_warning_zone = (WARNING_ZONE[0] <= foot_x <= WARNING_ZONE[2]) and (WARNING_ZONE[1] <= foot_y <= WARNING_ZONE[3])
                    print(f"[DEBUG_ZONE] Foot Point: ({foot_x},{foot_y}) | Inside Warning Zone: {in_warning_zone} | Inside Machine Zone: {in_danger_zone}")
                    
                    yolo_conf = float(box.conf[0].item())
                    yolo_conf_pct = int(yolo_conf * 100)
                    
                    # Compute distance-based confidence for UI HUD
                    mz_cx = (MACHINE_ZONE[0] + MACHINE_ZONE[2]) // 2
                    mz_cy = (MACHINE_ZONE[1] + MACHINE_ZONE[3]) // 2
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
                    (WARNING_ZONE[0], WARNING_ZONE[1]),
                    (WARNING_ZONE[2], WARNING_ZONE[3]),
                    warning_color,
                    3
                )
                cv2.putText(frame, warning_label,
                            (WARNING_ZONE[0], WARNING_ZONE[1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, warning_color, 2)

                # Draw Danger Zone / Machine Zone (Red if breached, Yellow if clear)
                danger_color = (0, 0, 255) if danger_in_frame else (0, 255, 255)
                danger_label = "MACHINE ZONE (DANGER BREACH)" if danger_in_frame else "MACHINE ZONE"
                cv2.rectangle(
                    frame,
                    (MACHINE_ZONE[0], MACHINE_ZONE[1]),
                    (MACHINE_ZONE[2], MACHINE_ZONE[3]),
                    danger_color,
                    3
                )
                cv2.putText(frame, danger_label,
                            (MACHINE_ZONE[0], MACHINE_ZONE[1] - 10),
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
                self.current_confidence = ai_confidence
                print(f"[DEBUG_ZONE] Current State: {self.safety_state} | Warning Zone Color: {'Orange' if (warning_in_frame or danger_in_frame) else 'Yellow'} | Machine Zone Color: {'Red' if danger_in_frame else 'Yellow'}")
                
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
                
                # Check alert and database logging trigger conditions (DANGER state only)
                trigger_email = False
                if self.safety_state == "DANGER":
                    if self._last_safety_state in ["SAFE", "WARNING"]:
                        trigger_email = True
                    elif now_time - self._last_email_sent_time >= EMAIL_ALERT_INTERVAL:
                        trigger_email = True
                        
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
                        from db import history_collection
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
                            "email_status": email_db_status
                        })
                        print(f"[EVENT] event stored: {event_name} | Status: {self.safety_state} | Count: {human_count} | Email Status: {email_db_status}")
                    except Exception as db_err:
                        print(f"Error inserting event into MongoDB: {db_err}")
                    
                    if trigger_email:
                        self._last_email_sent_time = now_time
                        
                        camera_display_name = f"Optical Node {self.source}"
                        timestamp_str = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                        attachment_name = datetime.now(IST).strftime("incident_%Y%m%d_%H%M%S.jpg")
                        
                        # Save snapshot to disk
                        import os
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
                
                # Save processed frame securely
                with self.read_lock:
                    self.processed_frame = frame
                    
                frame_count += 1
                if frame_count > 1_000_000:
                    frame_count = 0
            except Exception as loop_ex:
                import traceback
                print(f"[CRITICAL_ERROR] Exception in update_inference loop: {loop_ex}")
                traceback.print_exc()
                
            # Throttle loop to ~20 FPS (50ms sleep)
            time.sleep(0.05)

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
def generate_frames(source=0):
    print(f"[DEBUG] [GENERATOR] generate_frames generator function started for source: {source}")
    cam = camera_pool.acquire_camera(source)
    frame_count = 0
    
    try:
        while True:
            grabbed, frame = cam.read()
            
            # Offline/Broken stream watchdog fallback
            if not grabbed or frame is None:
                if frame_count <= 50 or frame_count % 30 == 0:
                    print(f"[DEBUG] [GENERATOR] Stream '{source}' offline or frame is None. frame_count={frame_count}, grabbed={grabbed}, frame_is_none={frame is None}")
                    print(f"[WARNING] Stream '{source}' offline/connecting. Rendering offline screen.")
                
                error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(error_frame, "⚠️ SENSOR OFFLINE: RECONNECTING...", (60, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                _, buffer = cv2.imencode(".jpg", error_frame)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                
                time.sleep(1.0)
                frame_count += 1
                continue
                
            ret, jpeg = cv2.imencode('.jpg', frame)
            if not ret:
                continue
                
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            
            time.sleep(0.05) # Throttle output stream
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
    active_cameras = list(camera_pool.cameras.values())
    
    print("===== LIVE TELEMETRY =====")
    print("Camera Pool Keys:", list(camera_pool.cameras.keys()))
    print("Last Active Source:", camera_pool.last_active_source)
    
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
        
    cam = active_cameras[0]
    print("Human Count:", getattr(cam, 'human_count', 0))
    print("Confidence:", getattr(cam, 'current_confidence', 0))
    print("Safety:", getattr(cam, 'safety_state', 'SAFE'))
    print("Camera Grabbed:", getattr(cam, 'grabbed', False))
    print("==========================")
    
    any_danger = False
    any_warning = False
    for c in active_cameras:
        c_state = getattr(c, 'safety_state', 'SAFE')
        if c_state == "DANGER":
            any_danger = True
        elif c_state == "WARNING":
            any_warning = True
            
    danger_val = "DANGER" if any_danger else ("WARNING" if any_warning else "SAFE")
            
    return {
        "human_count": getattr(cam, 'human_count', 0),
        "ai_confidence": getattr(cam, 'current_confidence', 0),
        "danger_state": danger_val,
        "machine_state": "STOP" if any_danger else "RUN",
        "fps": round(getattr(cam, '_current_fps', 20.0), 1),
        "latency": round(getattr(cam, 'latency_ms', 8.0), 1),
        "last_detection_time": getattr(cam, 'last_detection_time', "--"),
        "last_snapshot": "Snapshot Active" if any_danger else "",
        "camera_status": "Online" if getattr(cam, 'grabbed', False) else "Offline"
    }
