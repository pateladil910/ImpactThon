import os
from pymongo import MongoClient

mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)
from urllib.parse import urlparse
parsed = urlparse(mongo_uri)
db_name = parsed.path.strip('/') or "ai_safety"
db = client[db_name]

history_collection = db["history"]
