import cv2
import numpy as np
from ultralytics import YOLO

# =========================
# LOAD YOLO MODEL
# =========================
model = YOLO("yolov8n.pt")

# =========================
# =========================
# CAMERA
# =========================
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ ERROR: Could not open camera (Index 0). Trying Index 1...")
    cap = cv2.VideoCapture(1)

# =========================
# MACHINE DANGER ZONE (RECTANGLE)
# (x1, y1, x2, y2)
# =========================
MACHINE_ZONE = (360, 100, 620, 420)

# =========================
# GLOBAL SAFETY STATE
# =========================
safety_state = "SAFE"
current_confidence = 0  # 0-100%
latest_frame = None     # Raw frame for snapshot capture
danger_counter = 0
safe_counter = 0

ENTER_THRESHOLD = 1
EXIT_THRESHOLD = 8
FRAME_SKIP = 3  # OPTIMIZATION: Run YOLO every 3rd frame

# =========================
# BOX OVERLAP CHECK (FROM temp.py)
# =========================
def box_overlap(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    return xA < xB and yA < yB

# =========================
# FRAME GENERATOR
# =========================
def generate_frames():
    global safety_state, danger_counter, safe_counter, current_confidence, latest_frame

    frame_count = 0
    last_results = []


    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # RESIZE FOR PERFORMANCE (Fixes "Too Laggy")
        frame = cv2.resize(frame, (640, 480))
        latest_frame = frame.copy() # Capture for snapshot logic

        danger_in_frame = False

        # Draw machine zone
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

        # YOLO detect humans only (with frame skipping)
        if frame_count % FRAME_SKIP == 0:
            results = model(frame, conf=0.5, classes=[0], verbose=False)
            last_results = results
        else:
            results = last_results

        # Calc Machine Zone Center
        mz_cx = (MACHINE_ZONE[0] + MACHINE_ZONE[2]) // 2
        mz_cy = (MACHINE_ZONE[1] + MACHINE_ZONE[3]) // 2

        max_conf_frame = 0

        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                human_box = (x1, y1, x2, y2)
                
                # Human Center
                h_cx = (x1 + x2) // 2
                h_cy = (y1 + y2) // 2

                # Distance to Machine Zone Center
                dist = np.sqrt((h_cx - mz_cx)**2 + (h_cy - mz_cy)**2)

                # Logic: Closer = Higher Confidence
                # Max distance approx 600px. 
                # Conf = 100 - (dist / 6) -> 600px dist = 0% conf. 0px dist = 100% conf.
                calculated_conf = max(0, min(100, int(100 - (dist / 6))))

                if box_overlap(human_box, MACHINE_ZONE):
                    danger_in_frame = True
                    calculated_conf = 100  # Force max if inside
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
        
        current_confidence = max_conf_frame
        
        frame_count += 1

        # =========================
        # STABLE STATE MACHINE
        # =========================
        if danger_in_frame:
            danger_counter += 1
            safe_counter = 0
        else:
            safe_counter += 1
            danger_counter = 0

        if danger_counter >= ENTER_THRESHOLD:
            safety_state = "DANGER"

        if safe_counter >= EXIT_THRESHOLD:
            safety_state = "SAFE"

        # Banner
        banner_color = (0, 0, 255) if safety_state == "DANGER" else (0, 255, 0)
        banner_text = "SYSTEM STOPPED" if safety_state == "DANGER" else "SYSTEM RUNNING"

        cv2.putText(frame, banner_text,
                    (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1, banner_color, 3)

        _, buffer = cv2.imencode(".jpg", frame)
        frame = buffer.tobytes()

        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")

# =========================
# SAFETY STATE ACCESS
# =========================
def get_safety_state():
    return safety_state

def get_current_confidence():
    return current_confidence

def get_latest_frame():
    return latest_frame
