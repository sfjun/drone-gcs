import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import cv2
import numpy as np
import threading
import queue
import base64  # Base64 인코딩을 위해 추가됨

Gst.init(None)

class VideoManager:
    def __init__(self, port=5600, callback=None):
        self.port = port
        self.callback = callback
        self.video_queue = queue.Queue(maxsize=2)
        self.loop = None
        self.thread = None
        
        # GStreamer 파이프라인 설정
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

    def on_new_sample(self, sink):
        sample = sink.emit("pull-sample")
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
            
            # 👇 수정된 부분: 콜백 함수 호출 규격 맞추기 및 Base64 인코딩
            if self.callback:
                try:
                    # 웹 브라우저 전송을 위해 BGR 이미지를 JPG로 압축
                    ret, buffer = cv2.imencode('.jpg', frame)
                    if ret:
                        # 이미지를 Base64 문자열로 변환
                        b64_string = base64.b64encode(buffer).decode('utf-8')
                        # main.py의 gcs_callback(msg_type, data) 형태에 맞게 2개의 인자 전달
                        self.callback("VIDEO_FRAME", b64_string)
                except Exception as e:
                    print(f"❌ Video callback error: {e}")
            
            buf.unmap(map_info)
        return Gst.FlowReturn.OK

    def start(self):
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
        """최신 프레임을 가져오는 메서드"""
        if not self.video_queue.empty():
            return self.video_queue.get()
        return None

    def stop(self):
        self.pipeline.set_state(Gst.State.NULL)
        if self.loop:
            self.loop.quit()
        print("🛑 영상 수신기 종료")