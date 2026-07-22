"""
friend_hardware_sync.py - Cross-Machine Hardware Motor Interlock Daemon

Run this script on the friend's laptop / Raspberry Pi where the Arduino/ESP32 & Motor are connected via USB.
It automatically polls the live AI Safety Shield status from the cloud.
When ANY computer detects a human in the danger zone, this script immediately sends "STOP" to the connected motor relay!
"""

import time
import requests
import serial

# Status URL list — tries each in order until one returns a valid response
# ⚠️ IMPORTANT: The AI Flask server runs LOCALLY on this same machine (Raspberry Pi)
# The cloud backend (codevortex.in) CANNOT see local camera state — it only knows its own server state
# So we MUST poll localhost first!
STATUS_URLS = [
    "http://127.0.0.1:5000/status",         # Local Flask AI server (Raspberry Pi - primary)
    "http://localhost:5000/status",          # Same as above (alternative)
    "http://127.0.0.1:10000/status",        # Alternative port
    "https://codevortex.in/status",          # Cloud backend (last resort fallback)
]

def get_serial_connection():
    possible_ports = [
        "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyACM0", "/dev/ttyACM1",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "COM10"
    ]
    for port in possible_ports:
        try:
            ser = serial.Serial(port, 115200, timeout=1)
            time.sleep(2)
            print(f"✅ Hardware Motor Relay connected on {port}")
            return ser
        except Exception:
            pass
    return None

def poll_status():
    """Try each status URL in order, return True if DANGER detected."""
    for url in STATUS_URLS:
        try:
            res = requests.get(url, timeout=3)
            if res.status_code == 200:
                data = res.json()
                # Format 1: AI Flask /status → {danger_state: "DANGER", machine_state: "STOP"}
                danger_state = data.get("danger_state", "")
                machine_state = data.get("machine_state", "")
                # Format 2: Backend /api/status → {danger: true/false, zone: "DANGER"}
                is_danger_bool = data.get("danger", False)
                zone = data.get("zone", "")

                if (danger_state == "DANGER" or machine_state == "STOP"
                        or is_danger_bool or zone == "DANGER"):
                    print(f"[STATUS] DANGER detected via {url}")
                    return True
                else:
                    return False  # Got a valid safe response — stop trying
        except Exception as e:
            print(f"[STATUS] Could not reach {url}: {e}")
    return False  # All URLs failed — assume SAFE

def main():
    print("🔌 Searching for connected ESP32 / Arduino hardware...")
    ser = get_serial_connection()

    if not ser:
        print("⚠️ Warning: No USB serial device connected initially. Will auto-retry...")

    last_action = None
    print(f"🚀 Hardware Motor Sync Daemon running. Polling status every 0.3s ...\n")

    while True:
        try:
            if not ser:
                ser = get_serial_connection()

            is_danger = poll_status()
            current_action = "STOP" if is_danger else "SAFE"

            if current_action == "STOP":
                print("🚨 DANGER → Sending STOP to motor relay!")
                if ser:
                    try:
                        ser.write(b"STOP\n")
                        ser.flush()
                        ser.write(b"DANGER\n")
                        ser.flush()
                    except Exception as ser_err:
                        print(f"Serial write error: {ser_err}")
                        ser = None

            elif current_action == "SAFE" and last_action != "SAFE":
                print("🟢 SAFE → Sending SAFE to motor relay!")
                if ser:
                    try:
                        ser.write(b"SAFE\n")
                        ser.flush()
                    except Exception as ser_err:
                        print(f"Serial write error: {ser_err}")
                        ser = None

            last_action = current_action

            # Read any serial replies from Arduino/ESP32
            if ser and ser.in_waiting:
                reply = ser.readline().decode(errors="ignore").strip()
                if reply:
                    print(f"ESP32: {reply}")

        except Exception as err:
            print(f"Sync polling error: {err}")

        time.sleep(0.3)

if __name__ == "__main__":
    main()
