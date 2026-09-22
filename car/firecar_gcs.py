import os, sys, threading, time, tkinter as tk
from tkinter import scrolledtext
from PIL import Image, ImageTk
from pymavlink import mavutil
import cv2

# ====================================================
# [환경 설정] 본인의 노트북 수신 환경에 맞게 수정하세요
# ====================================================
TELEMETRY_PORT = 14550     # MAVProxy로부터 수신할 MAVLink UDP 포트
VIDEO_PORT = 5600          # 라즈베리파이가 쏴주는 비디오 수신 포트

class GCSDashboardApp:
    def __init__(self, window):
        self.window = window
        self.window.title("GCS Dashboard - Secure Direct UDP Mode")
        self.window.geometry("1100x680")
        self.window.configure(bg="#0f1424")

        self.telemetry = {"mode": "STANDBY", "cmd": "WAITING", "alt": -0.5, "lat": 0.0, "lon": 0.0, "conn": False}
        self.running = True

        # UI 레이아웃 배치
        self.video_frame = tk.Frame(window, width=640, height=480, bg="#000000")
        self.video_frame.pack(side=tk.LEFT, padx=20, pady=25)
        self.video_frame.pack_propagate(False)
        self.video_label = tk.Label(self.video_frame, text="RTP/UDP Stream Waiting (Port: 5600)...", fg="#ffffff", bg="#000000", font=("Helvetica", 13))
        self.video_label.pack(expand=True, fill=tk.BOTH)

        self.sidebar = tk.Frame(window, bg="#0f1424")
        self.sidebar.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(0, 20), pady=25)

        # 상단 비행 상태 (STATUS)
        self.status_frame = tk.Frame(self.sidebar, bg="#0f1424")
        self.status_frame.pack(fill=tk.X, pady=(0, 10))
        tk.Label(self.status_frame, text="DRONE / FLIGHT STATUS", font=("Malgun Gothic", 14, "bold"), fg="#7a8ba3", bg="#0f1424", anchor="w").pack(fill=tk.X, padx=10, pady=10)

        self.lbl_vars = {}
        for title, key, init_val in [("MODE:", "mode", "STANDBY"), ("COMMAND:", "cmd", "WAITING"), ("ALT:", "alt", "-0.5 m"), ("GPS:", "gps", "0.00000,\n0.00000")]:
            row = tk.Frame(self.status_frame, bg="#0f1424")
            row.pack(fill=tk.X, padx=15, pady=3)
            tk.Label(row, text=title, font=("Malgun Gothic", 11, "bold"), fg="#ffffff", bg="#0f1424", width=10, anchor="w").pack(side=tk.LEFT)
            fg_col = "#3897f0" if key != "cmd" else "#ffaa00"
            self.lbl_vars[key] = tk.Label(row, text=init_val, font=("Malgun Gothic", 13, "bold"), fg=fg_col, bg="#0f1424", anchor="w", justify=tk.LEFT)
            self.lbl_vars[key].pack(side=tk.LEFT, padx=10)

        # 하단 관제 채팅 (COMMAND CHAT)
        self.chat_frame = tk.Frame(self.sidebar, bg="#111625")
        self.chat_frame.pack(fill=tk.BOTH, expand=True, pady=(15, 0))
        
        tk.Label(self.chat_frame, text="COMMAND CHAT", font=("Malgun Gothic", 12, "bold"), fg="#3897f0", bg="#111625", anchor="w").pack(fill=tk.X, padx=15, pady=5)
        tk.Frame(self.chat_frame, height=2, bg="#3897f0").pack(fill=tk.X, padx=10, pady=(0, 5))

        self.chat_area = scrolledtext.ScrolledText(self.chat_frame, wrap=tk.WORD, bg="#0d1117", fg="#c9d1d9", insertbackground="white", font=("Malgun Gothic", 10), bd=0, highlightthickness=0, height=8)
        self.chat_area.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.chat_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] [SYSTEM] 관제 채팅창이 활성화되었습니다.\n")
        self.chat_area.configure(state='disabled')

        input_frame = tk.Frame(self.chat_frame, bg="#111625")
        input_frame.pack(fill=tk.X, padx=10, pady=(5, 12))

        self.chat_entry = tk.Entry(input_frame, bg="#1c212b", fg="#c9d1d9", insertbackground="white", font=("Malgun Gothic", 11), bd=1, relief=tk.SOLID, highlightcolor="#3897f0")
        self.chat_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4, padx=(0, 8))
        self.chat_entry.bind("<Return>", lambda e: self.send_chat_message())

        tk.Button(input_frame, text="전송", font=("Malgun Gothic", 10, "bold"), bg="#007acc", fg="#ffffff", bd=0, relief=tk.FLAT, width=8, command=self.send_chat_message).pack(side=tk.RIGHT, ipady=2)

        # 설정용 물리 임시 .sdp 파일 생성
        self.sdp_filename = "stream_config.sdp"
        sdp_content = (
            f"v=0\n"
            f"o=- 0 0 IN IP4 127.0.0.1\n"
            f"s=GCS_Video_Receiver\n"
            f"c=IN IP4 0.0.0.0\n"
            f"t=0 0\n"
            f"m=video {VIDEO_PORT} RTP/AVP 96\n"
            f"a=rtpmap:96 H264/90000"
        )
        with open(self.sdp_filename, "w", encoding="utf-8") as f:
            f.write(sdp_content)

        print(f"📡 [엔진 바인딩] 인라인 프로토콜 제어 코드 마운트 완료.")
        print(f"📺 비디오 수신 파이프라인 오픈 대기 (포트: {VIDEO_PORT})...")
        
        # 💡 [핵심 패치] 파일 경로 끝에 ?protocol_whitelist 옵션을 다이렉트로 붙여 FFmpeg 내부 강제 인젝션을 수행합니다.
        self.target_url = f"{self.sdp_filename}?protocol_whitelist=file,rtp,udp,crypto,data"
        self.cap = cv2.VideoCapture(self.target_url, cv2.CAP_FFMPEG)

        # 백그라운드 멀티스레드 구동
        threading.Thread(target=self._receive_mavlink_status, daemon=True).start()
        threading.Thread(target=self._receive_video_stream, daemon=True).start()
        self._update_ui_loop()
        window.protocol("WM_DELETE_WINDOW", self.on_closing)

    def send_chat_message(self):
        msg_text = self.chat_entry.get().strip()
        if not msg_text: return
        self.chat_area.configure(state='normal')
        self.chat_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] [GCS] {msg_text}\n")
        self.chat_area.see(tk.END)
        self.chat_area.configure(state='disabled')
        self.chat_entry.delete(0, tk.END)

    def _receive_mavlink_status(self):
        mode_map = {0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED", 5: "LOITER", 6: "RTL", 9: "LAND"}
        while self.running:
            try:
                mav_connection = mavutil.mavlink_connection(f'udp:0.0.0.0:{TELEMETRY_PORT}')
                while self.running:
                    msg = mav_connection.recv_match(blocking=True, timeout=1.0)
                    if msg is None: continue
                    self.telemetry["conn"] = True
                    if msg.get_type() == 'HEARTBEAT':
                        is_armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                        self.telemetry["mode"] = "STANDBY" if not is_armed else mode_map.get(msg.custom_mode, f"MODE: {msg.custom_mode}")
                        self.telemetry["cmd"] = "ARMING" if is_armed else "DISARMED"
                    elif msg.get_type() == 'GLOBAL_POSITION_INT':
                        self.telemetry["alt"] = msg.relative_alt / 1000.0
                        self.telemetry["lat"], self.telemetry["lon"] = msg.lat / 1e7, msg.lon / 1e7
            except:
                self.telemetry["conn"] = False
                time.sleep(2)

    def _update_ui_loop(self):
        if not self.running: return
        if self.telemetry["conn"]:
            self.lbl_vars["mode"].config(text=f"{self.telemetry['mode']}")
            self.lbl_vars["alt"].config(text=f"{self.telemetry['alt']:.1f} m")
            self.lbl_vars["gps"].config(text=f"{self.telemetry['lat']:.5f},  {self.telemetry['lon']:.5f}")
            self.lbl_vars["cmd"].config(text="ARMED (ACTIVE)" if self.telemetry["cmd"] == "ARMING" else "DISARMED", fg="#00ff66" if self.telemetry["cmd"] == "ARMING" else "#ffaa00")
        else:
            self.lbl_vars["mode"].config(text="STANDBY", fg="#3897f0")
            self.lbl_vars["cmd"].config(text="WAITING", fg="#a0a0a0")
            self.lbl_vars["alt"].config(text="-0.5 m", fg="#3897f0")
            self.lbl_vars["gps"].config(text="0.00000,  0.00000", fg="#3897f0")
        self.window.after(100, self._update_ui_loop)

    def _receive_video_stream(self):
        while self.running:
            if not self.cap.isOpened():
                time.sleep(1)
                self.cap = cv2.VideoCapture(self.target_url, cv2.CAP_FFMPEG)
                continue
            
            ret, frame = self.cap.read()
            if not ret or frame is None:
                continue
            
            img_tk = ImageTk.PhotoImage(image=Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
            if self.running:
                self.video_label.config(image=img_tk)
                self.video_label.image = img_tk

    def on_closing(self):
        self.running = False
        if self.cap.isOpened():
            self.cap.release()
        if os.path.exists(self.sdp_filename):
            try: os.remove(self.sdp_filename)
            except: pass
        self.window.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = GCSDashboardApp(root)
    root.mainloop()
