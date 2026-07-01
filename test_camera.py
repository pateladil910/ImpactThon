import cv2
import os
import time

# Enable verbose OpenCV video I/O logging to trace connection pipeline
os.environ["OPENCV_VIDEOIO_DEBUG"] = "1"

print("=== OpenCV Build & FFMPEG Diagnostics ===")
print("OpenCV Version:", cv2.__version__)

print("\n--- OpenCV Video I/O Build Details ---")
build_info = cv2.getBuildInformation()
video_io_section = False
for line in build_info.split('\n'):
    if "Video I/O" in line:
        video_io_section = True
    if video_io_section:
        print(line)
        if "Parallel framework" in line or "Other third-party libraries" in line:
            break

# Masked URL logging to protect credentials
raw_url = "rtsp://admin:Codevortex@12@192.168.1.64:554/Streaming/Channels/101"
masked_url = "rtsp://admin:******@192.168.1.64:554/Streaming/Channels/101"
print(f"\nTarget RTSP URL: {masked_url}")

# Set TCP transport option for FFMPEG
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

print("\nAttempting connection using cv2.VideoCapture(url, cv2.CAP_FFMPEG)...")
t0 = time.time()
cap = cv2.VideoCapture(raw_url, cv2.CAP_FFMPEG)
t_cap = time.time()
print(f"VideoCapture object created in {t_cap - t0:.3f}s")

is_opened = cap.isOpened()
print("cap.isOpened() result:", is_opened)

if is_opened:
    backend_val = cap.get(cv2.CAP_PROP_BACKEND)
    print("cv2.CAP_PROP_BACKEND value:", backend_val)
    
    # Attempt 30 consecutive reads
    print("\n--- Running 30 Consecutive Frame Reads ---")
    frame_saved = False
    
    for i in range(1, 31):
        t_read_start = time.time()
        ret, frame = cap.read()
        t_read_end = time.time()
        duration = t_read_end - t_read_start
        
        if ret and frame is not None:
            print(f"Read #{i:02d}: SUCCESS | Shape: {frame.shape} | Time: {duration:.4f}s")
            if not frame_saved:
                cv2.imwrite("test_frame.jpg", frame)
                print("   💾 Successfully saved first frame as test_frame.jpg")
                frame_saved = True
        else:
            print(f"Read #{i:02d}: FAILED | Time: {duration:.4f}s")
            
        time.sleep(0.03) # Match target 30 FPS timing
        
    cap.release()
else:
    print("❌ Connection Failed. cv2.VideoCapture could not open the RTSP source.")
