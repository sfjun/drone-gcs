# video_manager.py
import os
import subprocess
import threading
import time
import numpy as np
import cv2
import base64

class VideoManager:
    def __init__(self, callback, port=5600):
        self.callback = callback
        self.port = port
        self.process = None
        self.is_running = False
        self.stream_active = False
        self.thread = None
        self.standby_thread = None

    def start(self):
        self.start_stream()

    def _emit_standby_frame(self, text="WAITING FOR SIGNAL..."):
        width, height = 640, 480
        frame = np.zeros((height, width, 3), dtype=np.uint8)

        colors = [
            (255, 255, 255), (0, 255, 255), (255, 255, 0), (0, 255, 0),
            (255, 0, 255), (0, 0, 255), (255, 0, 0), (0, 0, 0)
        ]

        bar_width = width // len(colors)
        for i, color in enumerate(colors):
            start_x = i * bar_width
            end_x = start_x + bar_width if i < len(colors) - 1 else width
            frame[:, start_x:end_x] = color

        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 1.0
        thickness = 2
        
        text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
        text_x = (width - text_size[0]) // 2
        text_y = (height + text_size[1]) // 2
        
        pad = 12
        box_start = (text_x - pad, text_y - text_size[1] - pad)
        box_end = (text_x + text_size[0] + pad, text_y + pad)
        cv2.rectangle(frame, box_start, box_end, (30, 30, 30), -1)
        cv2.putText(frame, text, (text_x, text_y), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')
        self.callback("VIDEO", jpg_as_text)

    def _standby_loop(self):
        countdown = 20
        while self.is_running and not self.stream_active:
            if countdown > 0:
                self._emit_standby_frame(f"CONNECTING TO DRONE... {countdown}")
                countdown -= 1
            else:
                self._emit_standby_frame("WAITING FOR SIGNAL...")
            
            for _ in range(10):
                if not self.is_running or self.stream_active:
                    break
                time.sleep(0.1)

    def start_stream(self):
        if self.is_running:
            return

        self.is_running = True
        self.stream_active = False
        self.standby_thread = threading.Thread(target=self._standby_loop, daemon=True)
        self.standby_thread.start()

        # 👇 핫스팟 환경에서 루프백 및 모든 인터페이스의 RTP 수신을 원활하게 하도록 수정
        sdp_content = f"""v=0
o=- 0 0 IN IP4 127.0.0.1
s=NoName
c=IN IP4 0.0.0.0
t=0 0
m=video {self.port} RTP/AVP 96
a=rtpmap:96 H264/90000
a=fmtp:96 packetization-mode=1
"""

#         sdp_content = f"""v=0
# o=- 0 0 IN IP4 0.0.0.0
# s=NoName
# c=IN IP4 0.0.0.0
# t=0 0
# m=video {self.port} RTP/AVP 96
# a=rtpmap:96 H264/90000
# a=fmtp:96 packetization-mode=1
# """
        with open("stream.sdp", "w") as f:
            f.write(sdp_content)

        ffmpeg_path = r"C:\Users\taejung\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"

        # 🚀 딜레이 단축 옵션이 적용된 FFmpeg 명령어
        cmd = [
            ffmpeg_path, '-hide_banner', '-loglevel', 'error',
            '-protocol_whitelist', 'file,rtp,udp',
            '-analyzeduration', '100000',
            '-probesize', '32768',
            '-fflags', 'nobuffer+discardcorrupt', '-flags', 'low_delay',
            '-err_detect', 'ignore_err', '-i', 'stream.sdp',
            '-map', '0:v', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
        ]

        try:
            c_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,  
                creationflags=c_flags
            )
            
            threading.Thread(target=self._monitor_ffmpeg_logs, daemon=True).start()
            self.thread = threading.Thread(target=self._read_frames_loop, daemon=True)
            self.thread.start()
            print("🚀 [GCS] 비디오 스트림 수신 시작됨!")
            self.callback("LOG", "🎥 비디오 스트림 연결 시도 중...")
            
        except Exception as e:
            self.is_running = False
            self.stream_active = False
            print(f"❌ [GCS] FFmpeg 실행 실패: {e}")
            self._emit_standby_frame("ERROR: FFMPEG FAILED")
            self.callback("LOG", f"❌ FFmpeg 실행 실패: {e}")

    def _monitor_ffmpeg_logs(self):
        while self.is_running and self.process and self.process.stderr:
            try:
                line = self.process.stderr.readline()
                pass
            except:
                break

    def _read_frames_loop(self):
        buffer = b""
        while self.is_running and self.process:
            try:
                if not self.process.stdout:
                    break
                chunk = self.process.stdout.read(4096)
                if not chunk:
                    break
                buffer += chunk
                
                a = buffer.find(b'\xff\xd8')
                b = buffer.find(b'\xff\xd9')
                
                if a != -1 and b != -1 and b > a:
                    jpg_data = buffer[a:b+2]
                    buffer = buffer[b+2:]
                    
                    if not self.stream_active:
                        self.stream_active = True 
                        self.callback("LOG", "🟢 실시간 영상 수신 활성화!")

                    jpg_as_text = base64.b64encode(jpg_data).decode('utf-8')
                    self.callback("VIDEO", jpg_as_text)
                    
            except Exception as e:
                if self.is_running:
                    print(f"⚠️ [GCS] 프레임 읽기 중 에러: {e}")
                break

    def stop_stream(self):
        print("🛑 [GCS] 연결 해제 프로세스 시작...")
        self.is_running = False
        self.stream_active = False
        
        self.callback("LOG", "🛑 비디오 스트림 연결 해제됨")

        if self.process:
            pid = self.process.pid
            try:
                subprocess.run(
                    f"taskkill /F /T /PID {pid}",
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )
            except Exception as e:
                print(f"Taskkill 실패: {e}")
            
            try:
                if self.process.stdout: self.process.stdout.close()
                if self.process.stderr: self.process.stderr.close()
                if self.process.stdin: self.process.stdin.close()
            except:
                pass
            
            self.process = None

        print("🛑 [GCS] 비디오 스트림 안전하게 완전 종료됨")

    def stop(self):
        self.stop_stream()

    def isRunning(self):
        return self.is_running