from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017/")
db = client["ai_safety"]

history_collection = db["history"]
