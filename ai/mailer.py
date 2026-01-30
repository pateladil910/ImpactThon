import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ===============================
# 📧 EMAIL CONFIG
# ===============================
SENDER_EMAIL = "adilp4534@gmail.com"
APP_PASSWORD = "fpdkyriibohtspan"   # 16-digit app password
RECEIVER_EMAIL = "adilp4534@gmail.com"


def send_alert_email():
    subject = "🚨 ALERT: Human Detected in Danger Zone"
    body = """
⚠️ WARNING!

A human has been detected inside the machine danger zone.

Immediate action required.

— AI Safety System
"""

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECEIVER_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(SENDER_EMAIL, APP_PASSWORD)
    server.send_message(msg)
    server.quit()
