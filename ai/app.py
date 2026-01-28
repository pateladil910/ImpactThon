import pytz
from flask import Flask, Response, jsonify
from flask_cors import CORS
from ai.danger_zone_detection import generate_frames, get_safety_state
from ai.db import history_collection
from ai.routes.history_routes import history_bp
from datetime import datetime

IST = pytz.timezone("Asia/Kolkata")

app = Flask(__name__)
CORS(app)

app.register_blueprint(history_bp)

last_logged_state = None


@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/status")
def status():
    global last_logged_state

    state = get_safety_state()

    # ✅ LOG ONLY WHEN DANGER APPEARS
    if state == "DANGER" and last_logged_state != "DANGER":
        history_collection.insert_one({
            "event": "Human detected inside danger zone",
            "status": "DANGER",
            "timestamp": datetime.now(IST)   # IST correct
        })
        print("DB LOGGED: DANGER")

    last_logged_state = state

    return jsonify({
        "safety": state,
        "danger": state == "DANGER",
        "action": "STOP" if state == "DANGER" else "RUN"
    })



@app.route("/history")
def history():
    records = []

    for i, doc in enumerate(
        history_collection.find().sort("timestamp", -1)
    ):
        ts = doc["timestamp"]

        records.append({
            "id": i + 1,
            "event": doc["event"],
            "status": doc["status"],
            "date": ts.strftime("%d-%m-%Y"),
            "time": ts.strftime("%H:%M:%S")
        })

    return jsonify(records)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
