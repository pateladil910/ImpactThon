#!/bin/bash
# ============================================================
# 🚀 AI Safety Shield — One-Click Startup Script
# Run this on the Raspberry Pi with:
#   bash ~/ImpactThon/raspberry_pi/start.sh
# ============================================================

set -e  # Stop on any error

echo ""
echo "============================================"
echo "  🛡️  AI Safety Shield — Auto Startup"
echo "============================================"
echo ""

# ── Step 1: Stop old process ──────────────────
echo "⏹️  Stopping old service and freeing port 5000..."
sudo systemctl stop ai_safety.service 2>/dev/null || true
sudo fuser -k 5000/tcp 2>/dev/null || true
sleep 1
echo "   ✅ Done"

# ── Step 2: Pull latest code ──────────────────
echo ""
echo "📥 Pulling latest code from GitHub..."
cd ~/ImpactThon
git pull
echo "   ✅ Done"

# ── Step 3: Copy files to yolo folder ─────────
echo ""
echo "📋 Copying updated files to ~/yolo..."
cp ~/ImpactThon/raspberry_pi/app.py ~/yolo/app.py
cp ~/ImpactThon/raspberry_pi/friend_hardware_sync.py ~/yolo/friend_hardware_sync.py
echo "   ✅ Done"

# ── Step 4: Start the system ──────────────────
echo ""
echo "🚀 Starting AI detection system..."
echo "   Camera: rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101"
echo ""
echo "============================================"
echo "  Press Ctrl+C to stop"
echo "============================================"
echo ""

cd ~/yolo
source venv/bin/activate
python app.py --camera "rtsp://admin:Codevortex%4012@192.168.1.64:554/Streaming/Channels/101"
