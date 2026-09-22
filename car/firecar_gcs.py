import os, cv2, threading, time, tkinter as tk
from tkinter import scrolledtext
from PIL import Image, ImageTk
from pymavlink import mavutil

RPI_IP, MAVLINK_PORT = "192.168.0.72", 14550
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

class GCSDashboardApp:
    def __init__(self, window):
        self.window = window
        self.window.title("GCS Dashboard - Status & Chat")
        self.window.geometry("1100x680")
        self.window.configure(bg="#0f1424")

        self.telemetry = {"mode": "STANDBY", "cmd": "WAITING", "alt": -0.5, "lat": 0.0, "lon": 0.0, "conn": False}
        self.running = True

        # [1] UI 레이아웃 배치
        self.video_frame = tk.Frame(window, width=640, height=480, bg="#000000")
        self.video_frame.pack(side=tk.LEFT, padx=20, pady=25)
        self.video_frame.pack_propagate(False)
        self.video_label = tk.Label(self.video_frame, text="RTSP Stream Connecting...", fg="#ffffff", bg="#000000", font=("Helvetica", 13))
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

        # [2] 백그라운드 스레드 가동 및 루프
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
                mav_connection = mavutil.mavlink_connection(f'udp:0.0.0.0:{MAVLINK_PORT}')
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
        rtsp_url = f"rtsp://{RPI_IP}:8554/yolo_stream"
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        while self.running:
            if not cap.isOpened():
                time.sleep(2)
                cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
                continue
            while self.running:
                ret, frame = cap.read()
                if not ret:
                    cap.release()
                    break
                img_tk = ImageTk.PhotoImage(image=Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
                if self.running:
                    self.video_label.config(image=img_tk)
                    self.video_label.image = img_tk
        cap.release()

    def on_closing(self):
        self.running = False
        self.window.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = GCSDashboardApp(root)
    root.mainloop()
