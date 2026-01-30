import pytz
import serial
import time
import threading


from flask import Flask, Response, jsonify
from flask_cors import CORS
from datetime import datetime

from ai.mailer import send_alert_email
from ai.danger_zone_detection import generate_frames, get_safety_state
from ai.db import history_collection
from ai.routes.history_routes import history_bp

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
DANGER_CONFIRM_SECONDS = 1.0   # must stay danger for 1 sec

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

def send_email_async():
    try:
        send_alert_email()
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
                try:
                    threading.Thread(
                        target=send_email_async,
                        daemon=True
                    ).start()
                    email_sent_for_current_danger = True
                    print("✅ EMAIL SENT (LOCKED)")
                except Exception as e:
                    print("❌ EMAIL FAILED:", e)

                history_collection.insert_one({
                    "event": "Human detected inside danger zone",
                    "status": "DANGER",
                    "timestamp": datetime.now(IST)
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
                "timestamp": datetime.now(IST)
            })
            print("🧾 DB LOGGED: SAFE")

        email_sent_for_current_danger = False
        last_logged_state = "SAFE"

    return jsonify({
        "safety": last_logged_state,
        "danger": last_logged_state == "DANGER",
        "action": "STOP" if last_logged_state == "DANGER" else "RUN"
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

    ts = last["timestamp"].astimezone(IST)

    return jsonify({
        "time": ts.strftime("%H:%M:%S"),
        "status": last["status"]
    })

# ===============================
# ▶ RUN SERVER
# ===============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
