import cv2
import numpy as np
from ultralytics import YOLO

# =========================
# LOAD YOLO MODEL
# =========================
model = YOLO("yolov8n.pt")  # use yolov8s.pt if you want better accuracy

# =========================
# VIDEO SOURCE
# =========================
cap = cv2.VideoCapture(0)  # webcam

# =========================
# MACHINE DANGER ZONE (FIXED)
# Format: (x1, y1, x2, y2)
# =========================
MACHINE_ZONE = (360, 100, 620, 420)

# =========================
# CHECK BOX OVERLAP
# =========================
def box_overlap(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    if xA < xB and yA < yB:
        return True
    return False

# =========================
# MAIN LOOP
# =========================
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    danger = False

    # YOLO inference
    results = model(frame, conf=0.5, classes=[0])  # class 0 = person

    # Draw machine zone
    cv2.rectangle(
        frame,
        (MACHINE_ZONE[0], MACHINE_ZONE[1]),
        (MACHINE_ZONE[2], MACHINE_ZONE[3]),
        (0, 255, 0),
        3
    )
    cv2.putText(frame, "Machine Zone",
                (MACHINE_ZONE[0], MACHINE_ZONE[1] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    # Process detections
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            human_box = (x1, y1, x2, y2)

            # Draw HUMAN BOX (UNCHANGED SIZE)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
            cv2.putText(frame, "Human",
                        (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (255, 0, 0), 2)

            # Check overlap with machine zone
            if box_overlap(human_box, MACHINE_ZONE):
                danger = True
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                cv2.putText(frame, "DANGER!",
                            (x1, y2 + 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                            (0, 0, 255), 3)

    # Status banner
    if danger:
        cv2.putText(frame, "⚠ DANGER ZONE BREACHED",
                    (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1,
                    (0, 0, 255), 4)
    else:
        cv2.putText(frame, "SAFE OPERATION",
                    (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1,
                    (0, 255, 0), 4)

    cv2.imshow("AI Machine Safety System", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
