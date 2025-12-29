import cv2
from ultralytics import YOLO

# Load YOLOv8 model
model = YOLO("yolov8n.pt")

# Webcam
cap = cv2.VideoCapture(2)

if not cap.isOpened():
    print("Camera not working")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    # -----------------------------
    # MACHINE DANGER ZONE (FIXED)
    # -----------------------------
    # Adjust these values according to your setup
    mx1, my1 = int(w * 0.55), int(h * 0.2)
    mx2, my2 = int(w * 0.95), int(h * 0.85)

    human_near_machine = False

    # Run YOLO
    results = model(frame, stream=True)

    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])

            # PERSON = class 0
            if cls == 0 and conf > 0.5:
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                # Draw human box
                cv2.rectangle(frame, (x1, y1), (x2, y2),
                              (255, 0, 0), 2)
                cv2.putText(frame, "Human",
                            (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.7, (255, 0, 0), 2)

                # Check overlap with machine zone
                if not (x2 < mx1 or x1 > mx2 or y2 < my1 or y1 > my2):
                    human_near_machine = True

    # -----------------------------
    # DRAW MACHINE ZONE
    # -----------------------------
    zone_color = (0, 0, 255) if human_near_machine else (0, 255, 0)
    cv2.rectangle(frame, (mx1, my1), (mx2, my2), zone_color, 3)
    cv2.putText(frame, "Machine Zone",
                (mx1, my1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8, zone_color, 2)

    # -----------------------------
    # ALERT SYSTEM
    # -----------------------------
    if human_near_machine:
        cv2.putText(frame,
                    "ALERT! HUMAN NEAR MACHINE",
                    (30, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0, 0, 255), 3)

        # Red screen border
        cv2.rectangle(frame, (0, 0), (w, h), (0, 0, 255), 10)
    else:
        cv2.putText(frame,
                    "SAFE OPERATION",
                    (30, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1, (0, 255, 0), 3)

        # Green border
        cv2.rectangle(frame, (0, 0), (w, h), (0, 255, 0), 10)

    cv2.imshow("AI Machine Safety System", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
