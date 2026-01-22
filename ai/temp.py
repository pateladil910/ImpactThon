from ultralytics import YOLO
import cv2

model = YOLO("yolov8n.pt")

# Replace with YOUR phone IP
cap = cv2.VideoCapture(0)

DANGER_X1, DANGER_Y1 = 200, 100
DANGER_X2, DANGER_Y2 = 550, 420

while True:
    ret, frame = cap.read()
    if not ret:
        print("Camera not connected")
        break

    results = model(frame, stream=True)

    # Draw danger zone
    cv2.rectangle(frame, (DANGER_X1, DANGER_Y1), (DANGER_X2, DANGER_Y2), (0,0,255), 2)
    cv2.putText(frame, "DANGER ZONE", (DANGER_X1, DANGER_Y1-10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

    for r in results:
        for box in r.boxes:
            if int(box.cls[0]) == 0:  # person
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2

                if DANGER_X1 < cx < DANGER_X2 and DANGER_Y1 < cy < DANGER_Y2:
                    cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,255), 3)
                    cv2.putText(frame, "⚠ HUMAN IN DANGER ZONE",
                                (x1, y1-10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
                else:
                    cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)

    cv2.imshow("AI Smart Safety System (Phone Camera)", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
