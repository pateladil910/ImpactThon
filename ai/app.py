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
app.register_blueprint(history_bp)

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
@app.route("/status")
def status():
    global last_logged_state

    state = get_safety_state()   # SAFE or DANGER

    # 🔌 SEND TO ESP32 (SERIAL)
    if esp:
        if state == "DANGER":
            esp.write(b"DANGER\n")
        else:
            esp.write(b"SAFE\n")

    # 🧾 LOG ONLY WHEN DANGER APPEARS
    if state == "DANGER" and last_logged_state != "DANGER":
        history_collection.insert_one({
            "event": "Human detected inside danger zone",
            "status": "DANGER",
            "timestamp": datetime.now(IST)
        })
        print("🧾 DB LOGGED: DANGER")

    last_logged_state = state

    return jsonify({
        "safety": state,
        "danger": state == "DANGER",
        "action": "STOP" if state == "DANGER" else "RUN"
    })

# ===============================
# 📜 HISTORY API
# ===============================
@app.route("/history")
def history():
    records = []

    for i, doc in enumerate(
        history_collection.find().sort("timestamp", -1)
    ):
        ts = doc["timestamp"].astimezone(IST)

        records.append({
            "id": i + 1,
            "event": doc["event"],
            "status": doc["status"],
            "date": ts.strftime("%d-%m-%Y"),
            "time": ts.strftime("%H:%M:%S")
        })

    return jsonify(records)

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
