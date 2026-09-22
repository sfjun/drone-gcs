import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import cv2
import numpy as np
import threading
import time
import sys
import signal
import socket
import tkinter as tk
from tkinter import scrolledtext
from PIL import Image, ImageTk
from pymavlink import mavutil
import queue

# GStreamer 초기화
Gst.init(None)

# -------------------------------------------------------------------------
# [설정 및 글로벌 변수]
# -------------------------------------------------------------------------
MAVLINK_PORT = "udpin:127.0.0.1:14550" 

# BroadcastChannel용 로컬 브로드캐스트 포트설정
BROADCAST_PORT = 7000
BROADCAST_ADDR = '<broadcast>'

telemetry_data = {"roll": 0.0, "pitch": 0.0, "yaw": 0.0, "alt": 0.0, "mode": "UNKNOWN"}
chat_app = None  
loop = None      
video_queue = queue.Queue(maxsize=2)  

# -------------------------------------------------------------------------
# [1. MAVLink / MAVProxy 데이터 수신 스레드]
# -------------------------------------------------------------------------
def mavlink_receive_thread():
    global telemetry_data
    print(f"📡 MAVProxy 연결 대기 중... ({MAVLINK_PORT})")
    
    try:
        mav_connection = mavutil.mavlink_connection(MAVLINK_PORT)
        mav_connection.wait_heartbeat()
        print("🚀 MAVProxy 연결 성공! 하트비트 수신 완료.")
        
        if chat_app:
            chat_app.log_message("[GCS] MAVProxy 드론 연결 성공!")

        while True:
            msg = mav_connection.recv_match(blocking=True, timeout=1.0)
            if not msg:
                continue
                
            msg_type = msg.get_type()
            if msg_type == 'ATTITUDE':
                telemetry_data["roll"] = np.degrees(msg.roll)
                telemetry_data["pitch"] = np.degrees(msg.pitch)
                telemetry_data["yaw"] = np.degrees(msg.yaw)
            elif msg_type == 'VFR_HUD':
                telemetry_data["alt"] = msg.alt
            elif msg_type == 'HEARTBEAT':
                telemetry_data["mode"] = mavutil.mode_string_v10(msg)
                
            time.sleep(0.01)
    except Exception as e:
        print(f"❌ MAVLink 에러: {e}")

# -------------------------------------------------------------------------
# [2. BroadcastChannel 수신 스레드]
# -------------------------------------------------------------------------
def broadcast_channel_receive_thread():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('', BROADCAST_PORT))
    except Exception as e:
        print(f"❌ 브로드캐스트 채널 바인딩 실패: {e}")
        return

    while True:
        try:
            data, addr = sock.recvfrom(1024)
            message = data.decode('utf-8')
            if chat_app:
                chat_app.root.after(0, lambda m=message: chat_app.log_message(m))
        except Exception as e:
            print(f"❌ 채널 수신 에러: {e}")
            break
# -------------------------------------------------------------------------
# [3. GStreamer 영상 수신 콜백]
# -------------------------------------------------------------------------
pipeline_str = (
    "udpsrc port=5600 ! "
    "application/x-rtp, media=video, clock-rate=90000, encoding-name=H264 ! "
    "rtph264depay ! decodebin ! "
    "videoconvert ! video/x-raw, format=BGR ! "
    "appsink name=sink emit-signals=true max-buffers=1 drop=true"
)

pipeline = Gst.parse_launch(pipeline_str)
appsink = pipeline.get_by_name("sink")

def on_new_sample(sink):
    sample = sink.emit("pull-sample")
    buf = sample.get_buffer()
    caps = sample.get_caps()
    
    success, map_info = buf.map(Gst.MapFlags.READ)
    if success:
        structure = caps.get_structure(0)
        width = structure.get_value("width")
        height = structure.get_value("height")
        
        data = np.frombuffer(map_info.data, dtype=np.uint8)
        frame_readonly = data.reshape((height, width, 3))
        frame = frame_readonly.copy()
        
        # 텔레메트리 정보 영상 내부 오버레이
        cv2.putText(frame, f"MODE: {telemetry_data['mode']}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(frame, f"ALT: {telemetry_data['alt']:.1f}m", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(frame, f"YAW: {telemetry_data['yaw']:.1f}deg", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # 큐 버퍼를 최신화하여 화면 떨림 방지
        if video_queue.full():
            try:
                video_queue.get_nowait()
            except queue.Empty:
                pass
        video_queue.put(frame_rgb)
        
        buf.unmap(map_info)
    return Gst.FlowReturn.OK

appsink.connect("new-sample", on_new_sample)

def gstreamer_thread():
    global loop
    pipeline.set_state(Gst.State.PLAYING)
    print("⏳ UDP 포트 5600번으로 들어오는 영상 수신 시작...")
    loop = GLib.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass

# -------------------------------------------------------------------------
# [4. GCS 관제 인터페이스 및 통합 UI (Tkinter)]
# -------------------------------------------------------------------------
class GcsChatApplication:
    def __init__(self, root):
        self.root = root
        self.root.title("드론 GCS 통합 관제 시스템")
        self.root.geometry("1100x650") 
        
        # 브로드캐스트 송신용 소켓 생성
        self.send_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.send_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        
        # 레이아웃 분할 프레임
        self.left_frame = tk.Frame(root, bg="black")
        self.left_frame.pack(side=tk.LEFT, fill="both", expand=True, padx=5, pady=5)
        
        self.right_frame = tk.Frame(root, width=400)
        self.right_frame.pack(side=tk.RIGHT, fill="y", padx=5, pady=5)
        self.right_frame.pack_propagate(False) 

        # 좌측: 영상 레이블 영역
        self.video_label = tk.Label(self.left_frame, bg="black", text="영상 대기 중...", fg="white")
        self.video_label.pack(fill="both", expand=True)

        # 우측 상단: 드론 실시간 계기판 정보
        self.telemetry_frame = tk.LabelFrame(self.right_frame, text=" 드론 실시간 상태 (MAVProxy) ", padx=10, pady=10)
        self.telemetry_frame.pack(fill="x", pady=5)
        
        self.telemetry_label = tk.Label(
            self.telemetry_frame, 
            text="비행 모드: UNKNOWN\n고도: 0.0m\nRoll: 0.0° | Pitch: 0.0° | Yaw: 0.0°",
            justify="left", font=("Consolas", 11), fg="blue"
        )
        self.telemetry_label.pack(anchor="w")
        # 우측 중간: Broadcast Channel 로그 및 채팅창
        self.chat_frame = tk.LabelFrame(self.right_frame, text=" GCS Broadcast Channel 채팅창 ", padx=10, pady=10)
        self.chat_frame.pack(fill="both", expand=True, pady=5)
        
        self.chat_area = scrolledtext.ScrolledText(self.chat_frame, wrap=tk.WORD, font=("Malgun Gothic", 10))
        self.chat_area.pack(fill="both", expand=True)
        self.chat_area.configure(state='disabled')

        # 우측 하단: 채팅 입력 필드
        self.input_frame = tk.Frame(self.right_frame)
        self.input_frame.pack(fill="x", pady=5)
        
        self.entry_field = tk.Entry(self.input_frame, font=("Malgun Gothic", 11))
        self.entry_field.bind("<Return>", self.send_message)
        self.entry_field.pack(side=tk.LEFT, fill="x", expand=True, padx=(0, 5))
        
        self.send_button = tk.Button(self.input_frame, text="전송", command=self.send_message, width=10, bg="#4CAF50", fg="white")
        self.send_button.pack(side=tk.RIGHT)
        
        # 윈도우 창 포커스 상태에서의 Ctrl + C 바인딩 및 X 버튼 처리
        self.root.bind("<Control-c>", lambda e: shutdown_program())
        self.root.protocol("WM_DELETE_WINDOW", shutdown_program)
        
        self.log_message("[GCS] 시스템 시작. BroadcastChannel 채널 대기 중...")
        
        # UI 동기화 루프 작동 (주기적인 화면 갱신)
        self.update_gui_loop()

    def update_gui_loop(self):
        """30 FPS 타겟 주기로 비디오 큐를 안전하게 비우며 화면 파르르 떨림을 방지"""
        if not video_queue.empty():
            try:
                frame_rgb = video_queue.get_nowait()
                img = Image.fromarray(frame_rgb)
                img.thumbnail((680, 510)) 
                img_tk = ImageTk.PhotoImage(image=img)
                
                self.video_label.img_tk = img_tk
                self.video_label.config(image=img_tk, text="")
            except Exception:
                pass
        
        # 텔레메트리 수치 업데이트
        text = (
            f"비행 모드: {telemetry_data['mode']}\n"
            f"고도(Alt): {telemetry_data['alt']:.2f} m\n"
            f"자세(R/P/Y): R:{telemetry_data['roll']:.1f}° | P:{telemetry_data['pitch']:.1f}° | Y:{telemetry_data['yaw']:.1f}°"
        )
        self.telemetry_label.config(text=text)
        
        # 33밀리초 후 루프 재호출
        self.root.after(33, self.update_gui_loop)

    def send_message(self, event=None):
        """입력 데이터를 브로드캐스트 망으로 방출"""
        msg = self.entry_field.get().strip()
        if msg:
            formatted_msg = f"[GCS_Node]: {msg}"
            try:
                self.send_sock.sendto(formatted_msg.encode('utf-8'), (BROADCAST_ADDR, BROADCAST_PORT))
            except Exception as e:
                self.log_message(f"[에러] 송신 실패: {e}")
                
            self.entry_field.delete(0, tk.END)

    def log_message(self, message):
        """텍스트창 잠금을 해제하고 시계와 함께 스크롤 추가"""
        self.chat_area.configure(state='normal')
        current_time = time.strftime("[%H:%M:%S] ")
        self.chat_area.insert(tk.END, current_time + message + "\n")
        self.chat_area.configure(state='disabled')
        self.chat_area.yview(tk.END)

# -------------------------------------------------------------------------
# [5. Ctrl + C 및 안전 종료 처리 함수]
# -------------------------------------------------------------------------
def shutdown_program(signum=None, frame=None):
    print("\n🛑 프로그램 종료 요청 수신. 리소스를 해제합니다...")
    if pipeline:
        pipeline.set_state(Gst.State.NULL)
    if loop:
        loop.quit()
    try:
        if root:
            root.destroy()
    except Exception:
        pass
    print("✨ 모든 멀티스레드가 정상 종료되었습니다.")
    sys.exit(0)

# 시그널 핸들러 연결
signal.signal(signal.SIGINT, shutdown_program)

# -------------------------------------------------------------------------
# [6. 메인 실행부]
# -------------------------------------------------------------------------
if __name__ == "__main__":
    # 영상 스트리밍 스레드 가동
    video_thread = threading.Thread(target=gstreamer_thread, daemon=True)
    video_thread.start()
    
    # 마브링크 연동 스레드 가동
    mav_thread = threading.Thread(target=mavlink_receive_thread, daemon=True)
    mav_thread.start()
    
    # 브로드캐스트 채널 수신 스레드 가동
    chat_thread = threading.Thread(target=broadcast_channel_receive_thread, daemon=True)
    chat_thread.start()
    
    root = tk.Tk()
    chat_app = GcsChatApplication(root)
    
    try:
        root.mainloop()
    except KeyboardInterrupt:
        shutdown_program()
