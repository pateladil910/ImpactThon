import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import base64

# ===============================
# 📧 EMAIL CONFIG
# ===============================
SENDER_EMAIL = "adilp4534@gmail.com"
APP_PASSWORD = "fpdkyriibohtspan"   # 16-digit app password
RECEIVER_EMAIL = "adilp4534@gmail.com"


def send_alert_email(custom_message=None, image_base64=None):
    if custom_message:
        subject = "ALERT: System Periodic Stop"
    else:
        subject = "ALERT: Human Detected in Danger Zone"
    
    if custom_message:
        body = f"""
SYSTEM NOTICE

{custom_message}

- AI Safety System
"""
    else:
        body = """
WARNING!

A human has been detected inside the machine danger zone.

Immediate action required.

- AI Safety System
"""

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECEIVER_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    # Attachment logic
    if image_base64:
        try:
            image_data = base64.b64decode(image_base64)
            img_part = MIMEImage(image_data, name="detection.jpg")
            msg.attach(img_part)
        except Exception as e:
            print(f"Attachment Error: {e}")

    print(f"Attempting to send email to {RECEIVER_EMAIL}...")
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.set_debuglevel(1) 
        server.starttls()
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print("SMTP SUCCESS")
    except Exception as e:
        print(f"SMTP FAILED: {e}")
        raise e
