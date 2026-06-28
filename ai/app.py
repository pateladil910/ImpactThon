import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

import torch
torch.set_num_threads(1)

import pytz
import serial
import time
import threading


from flask import Flask, Response, jsonify
from flask_cors import CORS
from datetime import datetime

# from ai.mailer import send_alert_email
from mailer import send_alert_email
from danger_zone_detection import generate_frames, get_safety_state, get_current_confidence, get_latest_frame
from db import history_collection
from routes.history_routes import history_bp
# from ai.danger_zone_detection import generate_frames, get_safety_state, get_current_confidence, get_latest_frame
# from ai.db import history_collection
# from ai.routes.history_routes import history_bp
import cv2
import base64
import os
# ===============================
# 🌍 TIMEZONE
# ===============================
IST = pytz.timezone("Asia/Kolkata")

# ===============================
# 🔑 STATE + LOCKS
# ===============================
last_logged_state = "SAFE"
email_sent_for_current_danger = False

# 🧠 Detection stability
danger_start_time = None
DANGER_CONFIRM_SECONDS = 0.0   # Instant trigger (was 1.0)
system_override_stop = False # FORCE STOP FLAG

# 🔌 Relay debounce
last_relay_state = None

# ===============================
# 🔌 ESP32 SERIAL CONNECTION
# ===============================
try:
    esp = serial.Serial("COM3", 115200, timeout=1)
    time.sleep(2)
    print("✅ ESP32 connected via Serial")
except:
    esp = None
    print("❌ ESP32 NOT connected")

# ===============================
# 🚀 FLASK APP
# ===============================
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, ngrok-skip-browser-warning, bypass-tunnel-reminder"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

app.register_blueprint(history_bp, url_prefix="/api")

def construct_camera_source(url, username, password):
    if not url:
        return url
    if not isinstance(url, str):
        return url
    if url.isdigit():
        return int(url)
        
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

# ===============================
# 🎥 CAMERA STREAM
# ===============================
@app.route("/video_feed")
def video_feed():
    from flask import request
    source = request.args.get("source", "0")
    username = request.args.get("username", "")
    password = request.args.get("password", "")
    
    resolved_source = construct_camera_source(source, username, password)
    
    resp = Response(
        generate_frames(source=resolved_source),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )
    resp.headers['ngrok-skip-browser-warning'] = 'true'
    resp.headers['bypass-tunnel-reminder'] = 'true'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

def send_email_async(custom_message=None, image_base64=None):
    try:
        send_alert_email(custom_message=custom_message, image_base64=image_base64)
        print("✅ EMAIL SENT (ASYNC)")
    except Exception as e:
        print("❌ EMAIL FAILED:", e)

# ===============================
# 🛡 STATUS + SERIAL + DB + EMAIL
# ===============================
@app.route("/status")
def status():
    global last_logged_state
    global email_sent_for_current_danger
    global danger_start_time
    global last_relay_state
    global system_override_stop

    # 🚨 FORCE STOP CHECK
    if system_override_stop:
        return jsonify({
            "safety": "DANGER",
            "danger": True,
            "action": "STOP",
            "confidence": 100,
            "message": "TIMER EXPIRED - FORCE STOP"
        })

    state = get_safety_state()
    now = time.time()

    # ===============================
    # 🔴 DANGER (STABLE CHECK)
    # ===============================
    if state == "DANGER":

        if danger_start_time is None:
            danger_start_time = now

        if now - danger_start_time >= DANGER_CONFIRM_SECONDS:

            # 📧 EMAIL (ONCE PER DANGER)
            if not email_sent_for_current_danger:
                # Capture Photo
                img_b64 = None
                frame = get_latest_frame()
                if frame is not None:
                    _, buffer = cv2.imencode(".jpg", frame)
                    img_b64 = base64.b64encode(buffer).decode("utf-8")

                try:
                    threading.Thread(
                        target=send_email_async,
                        args=(None, img_b64),
                        daemon=True
                    ).start()
                    email_sent_for_current_danger = True
                    print("✅ EMAIL SENT (LOCKED)")
                except Exception as e:
                    print("❌ EMAIL FAILED:", e)

                history_collection.insert_one({
                    "event": "Human detected inside danger zone",
                    "status": "DANGER",
                    "timestamp": datetime.now(IST),
                    "timestamp_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
                    "photo_base64": img_b64
                })
                print("🧾 DB LOGGED: DANGER")

            # 🔌 RELAY DEBOUNCE
            if esp and last_relay_state != "DANGER":
                esp.write(b"DANGER\n")
                last_relay_state = "DANGER"
                print("📡 ESP32 -> DANGER")

            last_logged_state = "DANGER"

    # ===============================
    # 🟢 SAFE (RESET)
    # ===============================
    else:
        danger_start_time = None

        if last_logged_state == "DANGER":

            if esp and last_relay_state != "SAFE":
                esp.write(b"SAFE\n")
                last_relay_state = "SAFE"
                print("📡 ESP32 -> SAFE")

            history_collection.insert_one({
                "event": "Area clear",
                "status": "SAFE",
                "timestamp": datetime.now(IST),
                "timestamp_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
            })
            print("🧾 DB LOGGED: SAFE")

        email_sent_for_current_danger = False
        last_logged_state = "SAFE"

    return jsonify({
        "safety": last_logged_state,
        "danger": last_logged_state == "DANGER",
        "action": "STOP" if last_logged_state == "DANGER" else "RUN",
        "confidence": get_current_confidence()
    })

# ===============================
# 🕒 LAST DETECTION
# ===============================
@app.route("/last_detection")
def last_detection():
    try:
        last = history_collection.find_one(
            sort=[("timestamp", -1)]
        )

        if not last:
            return jsonify({"time": None})

        ts = last.get("timestamp")
        if not ts:
            return jsonify({"time": None, "error": "No timestamp in record"})

        if isinstance(ts, str):
            return jsonify({
                "time": ts,
                "status": last.get("status", "UNKNOWN")
            })

        if ts.tzinfo is None:
            ts = pytz.utc.localize(ts)
        
        ts_ist = ts.astimezone(IST)

        return jsonify({
            "time": ts_ist.strftime("%H:%M:%S"),
            "status": last.get("status", "UNKNOWN")
        })
    except Exception as e:
        print(f"❌ Error in /last_detection: {e}")
        # Return 200 with null time so frontend doesn't throw 500 error
        return jsonify({"time": None, "error": str(e)})

# ===============================
# 🛑 FORCE STOP API
# ===============================
@app.route("/api/force_stop", methods=["POST"])
def force_stop():
    global system_override_stop
    
    if not system_override_stop:
        system_override_stop = True
        
        # Log to DB
        history_collection.insert_one({
            "event": "Scheduled Time Completed - System Stopped",
            "status": "DANGER",
            "timestamp": datetime.now(IST),
            "timestamp_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        })

        # Send Email
        try:
            threading.Thread(
                target=send_alert_email,
                args=("⏰ Scheduled Time Completed. Machine Stopped.",),
                daemon=True
            ).start()
        except Exception as e:
            print(f"❌ Email Error: {e}")

        # Stop Relay
        if esp:
            esp.write(b"TIMEOUT\n")
    
    return jsonify({"status": "stopped"})

# ===============================
# 📷 TEST CONNECTION API
# ===============================
@app.route("/api/test_camera")
def test_camera():
    from flask import request
    import socket
    import urllib.parse
    
    source = request.args.get("source", "0")
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
            
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 4000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 4000)

        if not cap.isOpened():
            return jsonify({
                "status": "error",
                "message": "Camera stream failed to open. Verify credentials or camera channel."
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
            time.sleep(0.04)

        duration = time.time() - start_time
        cap.release()

        if frame_count >= 1 and width > 0 and height > 0:
            fps = round(frame_count / max(duration, 0.1), 1)
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

# ===============================
# ▶ RUN SERVER
# ===============================
if __name__ == "__main__":
    # Render provides a PORT environment variable. If it's not there, use 10000.
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
    # app.run(host="0.0.0.0", port=5001, debug=False)
