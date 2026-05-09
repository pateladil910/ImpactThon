# app.py - Raspberry Pi AI Surveillance Streamer
import cv2
import time
import requests
import base64
import threading
import argparse
import os
from flask import Flask, Response, jsonify
from flask_cors import CORS
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
# Replace with your production backend URL or local IP
BACKEND_API_URL = "https://codevortex.in/api/detection"

# Parse command-line arguments for dynamic camera URL
parser = argparse.ArgumentParser(description="AI Edge Agent for Camera Monitoring")
parser.add_argument('--camera', type=str, default='0', help='Camera URL (RTSP/HTTP) or Webcam ID (0)')
args = parser.parse_args()

# Load YOLOv8 model (yolov8n is fastest for Raspberry Pi)
model = YOLO('yolov8n.pt') 

# Initialize camera (Dynamic input: Webcam OR IP Camera/RTSP)
# If digit, it's a webcam ID. Otherwise, it's an IP URL.
cam_source = int(args.camera) if args.camera.isdigit() else args.camera
print(f"📡 Connecting to camera source: {cam_source}")
camera = cv2.VideoCapture(cam_source)

# Optimize for Raspberry Pi (Reduce resolution for better FPS)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# Global variables
output_frame = None
lock = threading.Lock()
last_detection_time = 0
DETECTION_COOLDOWN = 5 # seconds between sending alerts to backend

def detect_objects():
    global output_frame, lock, last_detection_time
    
    while True:
        success, frame = camera.read()
        if not success:
            print("Failed to read camera. Retrying...")
            time.sleep(1)
            # Try to reconnect
            camera.open(0)
            continue
            
        # Run YOLO detection
        results = model(frame, stream=True, conf=0.5)
        
        person_detected = False
        highest_conf = 0.0
        
        for r in results:
            boxes = r.boxes
            for box in boxes:
                # Class 0 in COCO dataset is 'person'
                cls = int(box.cls[0])
                if cls == 0:
                    person_detected = True
                    conf = float(box.conf[0])
                    if conf > highest_conf:
                        highest_conf = conf
                    
                    # Draw bounding box
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f'Person {conf:.2f}', (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

        # Handle Alerting System
        current_time = time.time()
        if person_detected and (current_time - last_detection_time > DETECTION_COOLDOWN):
            last_detection_time = current_time
            print(f"🚨 Person detected! Confidence: {highest_conf:.2f}")
            
            # Encode frame to base64 for backend
            _, buffer = cv2.imencode('.jpg', frame)
            jpg_as_text = base64.b64encode(buffer).decode('utf-8')
            
            # Send asynchronously to avoid blocking video stream
            threading.Thread(target=send_alert_to_backend, args=(highest_conf, jpg_as_text)).start()

        # Update global frame for Flask stream
        with lock:
            output_frame = frame.copy()

def send_alert_to_backend(confidence, image_b64):
    try:
        payload = {
            "danger": True,
            "confidence": int(confidence * 100),
            "userId": "raspberry_pi_cam_1",
            "image": f"data:image/jpeg;base64,{image_b64}"
        }
        res = requests.post(BACKEND_API_URL, json=payload, timeout=5)
        if res.status_code == 200:
            print("✅ Alert successfully sent to backend.")
        else:
            print(f"⚠️ Backend returned status {res.status_code}")
    except Exception as e:
        print(f"❌ Failed to send alert: {e}")

def generate_video_stream():
    global output_frame, lock
    
    while True:
        with lock:
            if output_frame is None:
                continue
            
            # Encode frame as JPEG
            success, encoded_image = cv2.imencode(".jpg", output_frame)
            if not success:
                continue
                
        # Yield the output frame in MJPEG byte format
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encoded_image) + b'\r\n')

@app.route("/video_feed")
def video_feed():
    # MJPEG Streaming route
    return Response(generate_video_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/status")
def status():
    return jsonify({"status": "running", "camera": camera.isOpened()})

if __name__ == "__main__":
    # Start the background detection thread
    t = threading.Thread(target=detect_objects)
    t.daemon = True
    t.start()
    
    # Start Flask server
    print("🚀 Starting AI Stream on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
