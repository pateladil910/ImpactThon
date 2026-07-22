"""
friend_hardware_sync.py - Cross-Machine Hardware Motor Interlock Daemon

Run this script on the friend's laptop / Raspberry Pi where the Arduino/ESP32 & Motor are connected via USB.
It automatically polls the live AI Safety Shield status from the cloud.
When ANY computer detects a human in the danger zone, this script immediately sends "STOP" to the connected motor relay!
"""

import time
import requests
import serial

# Cloud status endpoint URL (Render deployment or local IP)
CLOUD_STATUS_URL = "https://impactthon-ai.onrender.com/status"

def main():
    print("🔌 Searching for connected ESP32 / Arduino hardware...")
    
    ser = None
    possible_ports = ["/dev/ttyUSB0", "/dev/ttyACM0", "COM3", "COM4", "COM5", "COM6"]
    for port in possible_ports:
        try:
            ser = serial.Serial(port, 115200, timeout=1)
            time.sleep(2)
            print(f"✅ Hardware Motor Relay connected on {port}")
            break
        except Exception:
            ser = None

    if not ser:
        print("⚠️ Warning: No USB serial device connected. Please connect ESP32/Arduino via USB.")
    
    last_action = None
    print(f"🚀 Starting Hardware Motor Sync Daemon -> Polling {CLOUD_STATUS_URL} ...\n")

    while True:
        try:
            res = requests.get(CLOUD_STATUS_URL, timeout=3)
            if res.status_code == 200:
                data = res.json()
                safety = data.get("safety", "SAFE")
                action = data.get("action", "RUN")

                current_action = "STOP" if (safety == "DANGER" or action == "STOP") else "SAFE"

                if current_action != last_action:
                    if current_action == "STOP":
                        print("🚨 DANGER BREACH DETECTED ON DASHBOARD -> Sending STOP to Motor!")
                        if ser:
                            ser.write(b"STOP\n")
                            ser.flush()
                    else:
                        print("🟢 SAFETY CLEAR -> Sending SAFE to Motor!")
                        if ser:
                            ser.write(b"SAFE\n")
                            ser.flush()
                    last_action = current_action

                # Print incoming serial responses from Arduino/ESP32
                if ser and ser.in_waiting:
                    reply = ser.readline().decode(errors="ignore").strip()
                    if reply:
                        print(f"ESP32 Reply: {reply}")

        except Exception as err:
            print(f"Sync polling error: {err}")

        time.sleep(0.3)

if __name__ == "__main__":
    main()
