# video_manager.py
from __future__ import annotations

import threading
from typing import Any, Callable


class VideoManager:
    """
    GStreamer 미설치 Windows용 안전 대기 영상 매니저.
    나중에 RTSP/MediaMTX/OpenCV 영상 모듈로 교체 가능.
    """

    def __init__(self, callback: Callable[[str, dict[str, Any]], None] | None = None):
        self.callback = callback
        self.running = False
        self._lock = threading.Lock()

    def _send(self, message_type: str, data: dict[str, Any]) -> None:
        if self.callback:
            try:
                self.callback(message_type, data)
            except Exception as exc:
                print(f"[VideoManager] 콜백 오류: {exc}")

    def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self.running = True

        print("영상 모듈 대기 상태: GStreamer(gi) 없이 서버를 실행합니다.")
        self._send(
            "VIDEO_STATUS",
            {
                "status": "waiting",
                "message": "영상 입력 대기 중 — RTSP/MediaMTX 또는 GStreamer 연결 필요",
            },
        )

    def stop(self) -> None:
        with self._lock:
            if not self.running:
                return
            self.running = False

        self._send(
            "VIDEO_STATUS",
            {
                "status": "stopped",
                "message": "영상 모듈 정지",
            },
        )