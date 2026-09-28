import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import cv2
import numpy as np
import threading
import queue
import base64

Gst.init(None)

class VideoManager:
    def __init__(self, port=5600, callback=None):
        self.port = port
        self.callback = callback
        self.video_queue = queue.Queue(maxsize=2)
        self.loop = None
        self.thread = None
        self.pipeline = None  # 파이프라인 변수를 비워둠 (start 시 생성)

    def on_new_sample(self, sink):
        sample = sink.emit("pull-sample")
        if not sample:
            return Gst.FlowReturn.ERROR
            
        buf = sample.get_buffer()
        caps = sample.get_caps()
        
        success, map_info = buf.map(Gst.MapFlags.READ)
        if success:
            structure = caps.get_structure(0)
            width = structure.get_value("width")
            height = structure.get_value("height")
            
            data = np.frombuffer(map_info.data, dtype=np.uint8)
            frame = data.reshape((height, width, 3)).copy()
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            if self.video_queue.full():
                try:
                    self.video_queue.get_nowait()
                except queue.Empty:
                    pass
            self.video_queue.put(frame_rgb)
            
            # 콜백 함수 호출 규격 맞추기 및 Base64 인코딩
            if self.callback:
                try:
                    ret, buffer = cv2.imencode('.jpg', frame)
                    if ret:
                        b64_string = base64.b64encode(buffer).decode('utf-8')
                        self.callback("VIDEO_FRAME", b64_string)
                except Exception as e:
                    print(f"❌ Video callback error: {e}")
            
            buf.unmap(map_info)
        return Gst.FlowReturn.OK

    def start(self):
        # 💡 핵심 수정: 기존에 돌던 파이프라인이 있다면 완전히 삭제
        if self.pipeline:
            self.stop()
            
        # 💡 매 연결(start)마다 파이프라인을 완전히 새롭게 구축하여 스트림 멈춤 해결
        pipeline_str = (
            f"udpsrc port={self.port} ! "
            "application/x-rtp, media=video, clock-rate=90000, encoding-name=H264 ! "
            "rtph264depay ! decodebin ! "
            "videoconvert ! video/x-raw, format=BGR ! "
            "appsink name=sink emit-signals=true max-buffers=1 drop=true"
        )
        
        self.pipeline = Gst.parse_launch(pipeline_str)
        appsink = self.pipeline.get_by_name("sink")
        appsink.connect("new-sample", self.on_new_sample)

        self.pipeline.set_state(Gst.State.PLAYING)
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        print(f"⏳ UDP 포트 {self.port}번 영상 수신 시작...")

    def _run_loop(self):
        self.loop = GLib.MainLoop()
        try:
            self.loop.run()
        except Exception:
            pass

    def get_frame(self):
        if not self.video_queue.empty():
            return self.video_queue.get()
        return None

    def stop(self):
        # 완전히 객체에서 비워주어 재시작 시 꼬임을 방지
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
            self.pipeline = None
        if self.loop:
            self.loop.quit()
            self.loop = None
        print("🛑 영상 수신기 종료")