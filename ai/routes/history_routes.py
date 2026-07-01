from flask import Blueprint, jsonify, send_file
from db import history_collection
# from ai.db import history_collection
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

@history_bp.route("/analytics/data", methods=["GET"])
def analytics_data():
    t_type = request.args.get("type")
    date_str = request.args.get("date")
    
    if not t_type or not date_str:
        return jsonify({"success": False, "message": "Missing type or date"}), 400
        
    try:
        if t_type == "day":
            # date_str is "YYYY-MM-DD"
            from datetime import datetime, timedelta
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            
            # UTC boundaries based on IST start of day (-5.5h offset)
            start_date_utc = dt - timedelta(hours=5.5)
            end_date_utc = start_date_utc + timedelta(days=1)
            
            cursor = history_collection.find({
                "status": "DANGER",
                "timestamp": {
                    "$gte": start_date_utc,
                    "$lte": end_date_utc
                }
            })
            
            hourly_data = [0] * 24
            for doc in cursor:
                ts = doc["timestamp"]
                # Safeguard: if timestamp is timezone-naive, make it UTC
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=pytz.utc)
                ist_ts = ts.astimezone(IST)
                hour = ist_ts.hour
                if 0 <= hour < 24:
                    hourly_data[hour] += 1
                    
            labels = [f"{i}:00" for i in range(24)]
            return jsonify({
                "success": True,
                "labels": labels,
                "data": hourly_data
            })
            
        elif t_type == "month":
            # date_str is "YYYY-MM" or month name (e.g. jan, feb)
            month_map = {
                "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
            }
            
            from datetime import datetime, timedelta
            year = datetime.now().year
            month = 1
            
            if date_str.lower() in month_map:
                month = month_map[date_str.lower()]
            else:
                parts = date_str.split("-")
                if len(parts) == 2:
                    year = int(parts[0])
                    month = int(parts[1])
                else:
                    return jsonify({"success": False, "message": "Invalid date format for month"}), 400
                    
            # Month boundaries in IST start
            start_ist = datetime(year, month, 1)
            start_date_utc = start_ist - timedelta(hours=5.5)
            
            import calendar
            _, num_days = calendar.monthrange(year, month)
            end_ist = start_ist + timedelta(days=num_days)
            end_date_utc = end_ist - timedelta(hours=5.5)
            
            cursor = history_collection.find({
                "status": "DANGER",
                "timestamp": {
                    "$gte": start_date_utc,
                    "$lt": end_date_utc
                }
            })
            
            daily_data = [0] * num_days
            for doc in cursor:
                ts = doc["timestamp"]
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=pytz.utc)
                ist_ts = ts.astimezone(IST)
                day = ist_ts.day
                if 1 <= day <= num_days:
                    daily_data[day - 1] += 1
                    
            labels = [f"{i}" for i in range(1, num_days + 1)]
            return jsonify({
                "success": True,
                "labels": labels,
                "data": daily_data
            })
            
        else:
            return jsonify({"success": False, "message": "Invalid type"}), 400
            
    except Exception as e:
        print(f"❌ ANALYTICS DATA ERROR: {e}")
        return jsonify({"success": False, "message": str(e)}), 500