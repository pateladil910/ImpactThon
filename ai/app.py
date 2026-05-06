import pytz
import serial
import time
import threading


from flask import Flask, Response, jsonify
from flask_cors import CORS
from datetime import datetime

# from ai.mailer import send_alert_email
from mailer import send_alert_email
from ai.danger_zone_detection import generate_frames, get_safety_state, get_current_confidence, get_latest_frame
from ai.db import history_collection
from ai.routes.history_routes import history_bp
import cv2
import base64

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
CORS(app)
app.register_blueprint(history_bp, url_prefix="/api")

# ===============================
# 🎥 CAMERA STREAM
# ===============================
@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

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
    last = history_collection.find_one(
        sort=[("timestamp", -1)]
    )

    if not last:
        return jsonify({"time": None})

    ts = last["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST)

    return jsonify({
        "time": ts.strftime("%H:%M:%S"),
        "status": last["status"]
    })

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
# ▶ RUN SERVER
# ===============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
