from flask import Blueprint, jsonify, send_file
from ai.db import history_collection
import pytz
from datetime import datetime
import pandas as pd
import os
from flask import request
from collections import defaultdict

IST = pytz.timezone("Asia/Kolkata")

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
            "Date": doc["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST).strftime("%d-%m-%Y"),
            "Time": doc["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST).strftime("%H:%M:%S"),
            "Photo": doc.get("photo_base64")
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
            "Date": doc["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST).strftime("%d-%m-%Y"),
            "Time": doc["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST).strftime("%H:%M:%S")
        })

    try:
        df = pd.DataFrame(data)

        file_name = "human_detection_history.xlsx"
        file_path = os.path.join(os.getcwd(), file_name)

        df.to_excel(file_path, index=False)

        return send_file(
            file_path,
            as_attachment=True,
            download_name=file_name
        )
    except Exception as e:
        print(f"❌ EXCEL DOWNLOAD ERROR: {e}")
        return jsonify({"error": str(e)}), 500

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
        hour = doc["timestamp"].replace(tzinfo=pytz.utc).astimezone(IST).hour
        hours[str(hour)] += 1

    return jsonify(dict(hours))