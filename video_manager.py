import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import cv2
import numpy as np
import threading
import queue
import base64
import time
from datetime import datetime

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("⚠️ ultralytics가 설치되지 않아 AI 추론 없이 영상만 출력합니다.")

Gst.init(None)

class VideoManager:
    def __init__(self, port=5600, callback=None):
        self.port = port
        self.callback = callback
        self.video_queue = queue.Queue(maxsize=2)
        self.loop = None
        self.thread = None
        self.pipeline = None  # 파이프라인 변수를 비워둠 (start 시 생성)

        self.mobile_running = False
        self.mobile_thread = None
        self.ai_model = YOLO("yolov8n.pt") if YOLO_AVAILABLE else None
        self.last_ai_time = 0

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

    def start_mobile_ai(self, stream_url):
        # 기존에 돌던 영상이 있다면 먼저 깔끔하게 종료
        self.stop()
        
        # "0", "1" 같은 숫자면 웹캠 번호로, 주소(http://...)면 문자열 그대로 인식
        src = int(stream_url) if str(stream_url).isdigit() else stream_url
        self.mobile_running = True
        self.mobile_thread = threading.Thread(target=self._mobile_ai_loop, args=(src,), daemon=True)
        self.mobile_thread.start()
        print(f"📱 무선 모바일 AI 카메라 연결 시작: {src}")

    def _mobile_ai_loop(self, src):
        if isinstance(src, int):
            cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(src)
            
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        if not cap.isOpened():
            print(f"❌ 모바일 카메라 연결 실패: {src}")
            self.mobile_running = False
            return

        # ✨ 1. AI 전용 백그라운드 스레드 공유 변수
        latest_raw_frame = None
        last_boxes = []
        coords = []
        ai_lock = threading.Lock()

        # ✨ 2. 부드러운 디지털 줌(짐벌 효과)을 위한 현재 카메라 중심 좌표
        smooth_cx, smooth_cy = 320.0, 240.0

        # 🚀 AI 추론만 전담하는 별도 데몬 스레드 (영상 송출 루프를 절대 멈추지 않음!)
        def _ai_worker():
            nonlocal latest_raw_frame, last_boxes, coords
            while self.mobile_running:
                if latest_raw_frame is None or self.ai_model is None:
                    time.sleep(0.01)
                    continue

                # 현재 프레임 복사 후 추론 (GPU가 있다면 device=0 옵션이 자동 적용됨)
                infer_frame = latest_raw_frame.copy()
                results = self.ai_model(infer_frame, classes=[0], conf=0.5, imgsz=320, verbose=False)
                boxes = results[0].boxes

                new_boxes = []
                new_coords = []
                max_conf = 0.0

                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    conf = float(box.conf[0])
                    if conf > max_conf:
                        max_conf = conf
                    cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                    
                    new_boxes.append((x1, y1, x2, y2))
                    new_coords.append({
                        "box_2d": [x1, y1, x2, y2],
                        "center": [cx, cy],
                        "confidence": conf
                    })

                with ai_lock:
                    last_boxes = new_boxes
                    coords = new_coords

                # 프론트엔드 이벤트 전송 (0.5초 간격으로 넓혀 웹소켓 부하 감소)
                if len(new_coords) > 0:
                    now = time.time()
                    if now - self.last_ai_time > 0.5 and self.callback:
                        self.last_ai_time = now
                        time_str = datetime.now().strftime("%H:%M:%S")
                        self.callback("AI_EVENT", {
                            "type": "PERSON_DETECTED",
                            "msg": f"요구조자 {len(new_coords)}명 감지! (모바일 AI)",
                            "conf": max_conf,
                            "count": len(new_coords),
                            "coordinates": new_coords,
                            "time": time_str
                        })
                
                time.sleep(0.05) # 초당 약 15~20회 AI 추론 (영상 프레임과 독립 작동)

        # AI 워커 스레드 시작
        ai_thread = threading.Thread(target=_ai_worker, daemon=True)
        ai_thread.start()

        # 🎥 메인 루프: 화면 이동/확대 없이 원본 화각에 초록색 박스만 그리기 (렉 제로화)
        while self.mobile_running and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.005)
                continue

            frame = cv2.resize(frame, (640, 480))
            frame = cv2.flip(frame, 1)

            # AI 스레드가 가져갈 수 있도록 최신 원본 프레임 업데이트 (복사본 전달로 충돌 방지)
            latest_raw_frame = frame

            with ai_lock:
                current_boxes = list(last_boxes)

            # 1. 고정된 원본 화면 위에 초록색 박스만 그리기 (디지털 줌/트래킹 제거!)
            for (x1, y1, x2, y2) in current_boxes:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # 2. JPEG 압축 및 전송
            if self.callback:
                ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
                if ret:
                    b64_string = base64.b64encode(buffer).decode('utf-8')
                    self.callback("VIDEO_FRAME", b64_string)

            time.sleep(0.01)

        cap.release()
        print("🛑 모바일 AI 카메라 종료")

    def start(self):
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
        self.mobile_running = False
        if self.mobile_thread and self.mobile_thread.is_alive():
            self.mobile_thread.join(timeout=1.0)
            self.mobile_thread = None

        # 완전히 객체에서 비워주어 재시작 시 꼬임을 방지
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
            self.pipeline = None
        if self.loop:
            self.loop.quit()
            self.loop = None
        print("🛑 영상 수신기 종료")