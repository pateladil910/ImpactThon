import pytz
import serial
import time

from flask import Flask, Response, jsonify
from flask_cors import CORS
from datetime import datetime

from ai.danger_zone_detection import generate_frames, get_safety_state
from ai.db import history_collection
from ai.routes.history_routes import history_bp

# ===============================
# 🌍 TIMEZONE
# ===============================
IST = pytz.timezone("Asia/Kolkata")

# ===============================
# 🔌 ESP32 SERIAL CONNECTION
# ===============================
try:
    esp = serial.Serial("COM3", 115200, timeout=1)  # CHANGE COM if needed
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
last_logged_state = None

# ===============================
# 🎥 CAMERA STREAM
# ===============================
@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

# ===============================
# 🛡 STATUS + SERIAL + DB
# ===============================
# global variable (already present)
last_logged_state = None

@app.route("/status")
def status():
    global last_logged_state

    state = get_safety_state()

    # 🔴 Log DANGER (once)
    if state == "DANGER" and last_logged_state != "DANGER":
        history_collection.insert_one({
            "event": "Human detected inside danger zone",
            "status": "DANGER",
            "timestamp": datetime.now(IST)
        })
        print("🧾 DB LOGGED: DANGER")

    # 🟢 Log SAFE (only after danger)
    elif state == "SAFE" and last_logged_state == "DANGER":
        history_collection.insert_one({
            "event": "Area clear",
            "status": "SAFE",
            "timestamp": datetime.now(IST)
        })
        print("🧾 DB LOGGED: SAFE")

    # update state memory
    last_logged_state = state

    return jsonify({
        "safety": state,
        "danger": state == "DANGER",
        "action": "STOP" if state == "DANGER" else "RUN"
    })

# ===============================
# 📜 HISTORY API
# ===============================
# @app.route("/clear_history", methods=["POST"])
# def clear_history():
#     global last_logged_state
#     history_collection.delete_many({})
#     last_logged_state = None   # 🔑 reset state
#     return jsonify({"success": True})


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
