import cv2
import numpy as np
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
cap = cv2.VideoCapture(1)

# ---- DANGER ZONE (POLYGON) ----
DANGER_ZONE = [(180,120),(460,140),(520,300),(400,420),(200,380)]
danger_np = np.array(DANGER_ZONE, np.int32)

prev_center = None
machine_running = True

def moving_towards(prev, curr):
    return curr[1] > prev[1]  # simple downward movement

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame, conf=0.5, verbose=False)
    danger = False
    prediction = False

    for box in results[0].boxes:
        if int(box.cls[0]) == 0:
            x1,y1,x2,y2 = map(int, box.xyxy[0])
            cx, cy = (x1+x2)//2, (y1+y2)//2

            inside = cv2.pointPolygonTest(danger_np,(cx,cy),False)

            if prev_center:
                if moving_towards(prev_center, (cx,cy)) and inside < 0:
                    prediction = True

            if inside >= 0:
                danger = True
                machine_running = False

            prev_center = (cx, cy)

            cv2.rectangle(frame,(x1,y1),(x2,y2),
                          (0,0,255) if inside>=0 else (0,255,0),2)
            cv2.circle(frame,(cx,cy),5,(255,0,0),-1)

    cv2.polylines(frame,[danger_np],True,(0,0,255),3)

    if prediction and machine_running:
        cv2.putText(frame,"⚠️ HUMAN APPROACHING DANGER",
                    (30,40),cv2.FONT_HERSHEY_SIMPLEX,0.9,(0,165,255),3)

    if not machine_running:
        cv2.putText(frame,"🛑 MACHINE STOPPED",
                    (30,80),cv2.FONT_HERSHEY_SIMPLEX,1,(0,0,255),3)
    else:
        cv2.putText(frame,"🟢 MACHINE RUNNING",
                    (30,80),cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,0),3)

    cv2.imshow("AI Smart Safety System", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
