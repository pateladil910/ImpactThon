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
# Cloud status endpoint URL — same backend the dashboard uses
# Cloud status endpoint URL — same backend the dashboard uses
CLOUD_STATUS_URL = "https://codevortex.in/api/status"

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

def main():
    print("🔌 Searching for connected ESP32 / Arduino hardware...")
    ser = get_serial_connection()

    if not ser:
        print("⚠️ Warning: No USB serial device connected initially. Will auto-retry on detection...")
    
    last_action = None
    print(f"🚀 Starting Hardware Motor Sync Daemon -> Polling {CLOUD_STATUS_URL} ...\n")

    while True:
        try:
            if not ser:
                ser = get_serial_connection()

            res = requests.get(CLOUD_STATUS_URL, timeout=3)
            if res.status_code == 200:
                data = res.json()
                is_danger = data.get("danger", False)
                zone = data.get("zone", data.get("safety", "SAFE"))

                current_action = "STOP" if (is_danger or zone == "DANGER") else "SAFE"

                if current_action == "STOP":
                    print("🚨 DANGER BREACH DETECTED -> CONTINUOUS MOTOR STOP ACTIVE!")
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
                    print("🟢 SAFETY CLEAR -> Sending SAFE to Motor!")
                    if ser:
                        try:
                            ser.write(b"SAFE\n")
                            ser.flush()
                        except Exception as ser_err:
                            print(f"Serial write error: {ser_err}")
                            ser = None

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
