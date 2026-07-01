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


def send_alert_email(custom_message=None, image_base64=None, filename="detection.jpg", html_body=None):
    if custom_message:
        subject = "🚨 ALERT: Safety Incident Report"
    else:
        subject = "🚨 ALERT: Human Detected in Danger Zone"
    
    # "related" subtype is crucial for embedding inline images in HTML bodies
    msg = MIMEMultipart("related")
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECEIVER_EMAIL
    msg["Subject"] = subject

    # Attach Body
    if html_body:
        msg.attach(MIMEText(html_body, "html"))
    else:
        body = custom_message or "A human has been detected inside the machine danger zone.\n\nImmediate action required.\n\n- AI Safety System"
        msg.attach(MIMEText(body, "plain"))

    # Attachment logic
    if image_base64:
        try:
            image_data = base64.b64decode(image_base64)
            img_part = MIMEImage(image_data)
            img_part.add_header('Content-ID', '<incident_snapshot>')
            img_part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(img_part)
        except Exception as e:
            print(f"Attachment Error: {e}")

    print(f"Attempting to send email to {RECEIVER_EMAIL}...")
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.set_debuglevel(0) # Keep logs concise and prevent excessive stdout spam
        server.starttls()
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print("SMTP SUCCESS")
    except Exception as e:
        print(f"SMTP FAILED: {e}")
        raise e
