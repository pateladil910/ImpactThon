import os
from pymongo import MongoClient

mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)
db = client["test"]

history_collection = db["history"]
