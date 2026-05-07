import sys
import os

# Add parent dir to path so we can import ai.mailer
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from ai.mailer import send_alert_email
    print("Testing Email System...")
    send_alert_email("TEST MESSAGE: If you see this, your email configuration is correct.")
    print("\nCheck your inbox for a 'Safety System Notification' email.")
except Exception as e:
    print(f"\nFATAL ERROR: {e}")
