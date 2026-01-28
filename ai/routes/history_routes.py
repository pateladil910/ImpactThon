from flask import Blueprint, jsonify, send_file
from ai.db import history_collection
from zoneinfo import ZoneInfo
import pandas as pd
import os
from flask import request
from collections import defaultdict

IST = ZoneInfo("Asia/Kolkata")

history_bp = Blueprint("history", __name__)

# ===============================
# 📜 GET HISTORY
# ===============================
@history_bp.route("/history", methods=["GET"])
def get_history():
    records = []

    for doc in history_collection.find().sort("timestamp", -1):
        records.append({
            "Event": doc["event"],
            "Status": doc["status"],
            "Date": doc["timestamp"].astimezone(IST).strftime("%d-%m-%Y"),
            "Time": doc["timestamp"].astimezone(IST).strftime("%H:%M:%S")
        })

    return jsonify(records)

# ===============================
# 📥 DOWNLOAD HISTORY (EXCEL)
# ===============================
@history_bp.route("/history/download", methods=["GET"])
def download_history_excel():
    data = []

    for doc in history_collection.find().sort("timestamp", -1):
        data.append({
            "Event": doc["event"],
            "Status": doc["status"],
            "Date": doc["timestamp"].astimezone(IST).strftime("%d-%m-%Y"),
            "Time": doc["timestamp"].astimezone(IST).strftime("%H:%M:%S")
        })

    df = pd.DataFrame(data)

    file_name = "human_detection_history.xlsx"
    file_path = os.path.join(os.getcwd(), file_name)

    df.to_excel(file_path, index=False)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file_name
    )

# ===============================
# 🗑 CLEAR ALL HISTORY
# ===============================
@history_bp.route("/clear_history", methods=["POST"])
def clear_history():
    history_collection.delete_many({})
    return jsonify({"message": "History cleared successfully"})

@history_bp.route("/analytics/hourly", methods=["GET"])
def analytics_hourly():
    hours = defaultdict(int)

    for doc in history_collection.find({"status": "DANGER"}):
        hour = doc["timestamp"].astimezone(IST).hour
        hours[str(hour)] += 1

    return jsonify(dict(hours))