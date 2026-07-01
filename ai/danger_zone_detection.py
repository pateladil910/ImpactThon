import os
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
import cv2
cv2.setNumThreads(1)
import numpy as np
from ultralytics import YOLO
import threading
import time

# ==========================================
# 🧠 LOAD YOLO MODEL
# ==========================================
model = YOLO("yolov8n.pt")

# ==========================================
# 🛡️ MACHINE DANGER ZONE (RECTANGLE)
# ==========================================
MACHINE_ZONE = (360, 100, 620, 420)

ENTER_THRESHOLD = 1
EXIT_THRESHOLD = 8
FRAME_SKIP = 3  # Run YOLO inference every 3rd frame

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
        self.safe_counter = 0
        
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
            
            # Draw Machine Zone
            cv2.rectangle(
                frame,
                (MACHINE_ZONE[0], MACHINE_ZONE[1]),
                (MACHINE_ZONE[2], MACHINE_ZONE[3]),
                (0, 255, 255),
                3
            )
            cv2.putText(frame, "MACHINE ZONE",
                        (MACHINE_ZONE[0], MACHINE_ZONE[1] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            
            # YOLO detect humans only (Class 0)
            if frame_count % FRAME_SKIP == 0:
                results = model(frame, conf=0.5, classes=[0], verbose=False)
                last_results = results
            else:
                results = last_results
                
            mz_cx = (MACHINE_ZONE[0] + MACHINE_ZONE[2]) // 2
            mz_cy = (MACHINE_ZONE[1] + MACHINE_ZONE[3]) // 2
            max_conf_frame = 0
            
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    human_box = (x1, y1, x2, y2)
                    
                    h_cx = (x1 + x2) // 2
                    h_cy = (y1 + y2) // 2
                    dist = np.sqrt((h_cx - mz_cx)**2 + (h_cy - mz_cy)**2)
                    calculated_conf = max(0, min(100, int(100 - (dist / 6))))
                    
                    if box_overlap(human_box, MACHINE_ZONE):
                        danger_in_frame = True
                        calculated_conf = 100
                        color = (0, 0, 255)
                        label = "DANGER"
                    else:
                        color = (0, 255, 0)
                        label = f"SAFE ({calculated_conf}%)"
                        
                    if calculated_conf > max_conf_frame:
                        max_conf_frame = calculated_conf
                        
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
                    cv2.putText(frame, label, (x1, y1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
                                
            self.current_confidence = max_conf_frame
            frame_count += 1
            if frame_count > 1_000_000:
                frame_count = 0
                
            # Proximity State Machine
            if danger_in_frame:
                self.danger_counter += 1
                self.safe_counter = 0
            else:
                self.safe_counter += 1
                self.danger_counter = 0
                
            if self.danger_counter >= ENTER_THRESHOLD:
                self.safety_state = "DANGER"
            if self.safe_counter >= EXIT_THRESHOLD:
                self.safety_state = "SAFE"
                
            # Overlay status banner
            banner_color = (0, 0, 255) if self.safety_state == "DANGER" else (0, 255, 0)
            banner_text = "SYSTEM STOPPED" if self.safety_state == "DANGER" else "SYSTEM RUNNING"
            cv2.putText(frame, banner_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.1, banner_color, 3)
            
            # Save processed frame securely
            with self.read_lock:
                self.processed_frame = frame
                
            if not hasattr(self, '_inference_count'):
                self._inference_count = 0
            self._inference_count += 1
            if self._inference_count <= 50 or self._inference_count % 100 == 0:
                print(f"[DEBUG] [INFERENCE_THREAD] id={id(self)} | update_inference() processed #{self._inference_count} frames")
                
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
