from datetime import datetime
from ai.db import history_collection


def save_event(event, status):
    history_collection.insert_one({
    "event": event,
    "status": status,
    "timestamp": datetime.now()
    })


def create_event(event, status, confidence=0):
    return {
        "event": event,
        "status": status,
        "confidence": confidence,
        "date": __import__("datetime").datetime.now().strftime("%d-%m-%Y"),
        "time": __import__("datetime").datetime.now().strftime("%H:%M:%S")
    }


def get_all_events():
    data = []
    for i, item in enumerate(history_collection.find().sort("timestamp", -1)):
        data.append({
            "id": i + 1,
            "event": item["event"],
            "status": item["status"],
            "date": item["timestamp"].strftime("%d-%m-%Y"),
            "time": item["timestamp"].strftime("%H:%M:%S")
    })
    return data