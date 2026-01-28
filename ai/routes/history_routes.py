from flask import Blueprint, jsonify, send_file
from ai.db import history_collection
import pandas as pd
from datetime import datetime
from zoneinfo import ZoneInfo
import os

IST = ZoneInfo("Asia/Kolkata")

history_bp = Blueprint("history", __name__)

@history_bp.route("/api/history", methods=["GET"])
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


@history_bp.route("/api/history/download", methods=["GET"])
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
