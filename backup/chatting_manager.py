# ============================================================
# chatting_manager.py
# AI Drone GCS - Chatting Manager
#
# 담당 기능
# 1. 일반 관제 채팅
# 2. 영상 관제 채팅
# 3. 시스템 메시지
# 4. 채팅 기록 관리
# 5. 메시지 길이 / 빈 메시지 검증
# 6. 호출부호 / 사용자명 관리
# 7. 선택적 JSONL 로그 저장
# ============================================================


import json
import threading
import uuid

from collections import deque
from datetime import datetime
from pathlib import Path


class ChattingManager:
    def __init__(
        self,
        callback=None,
        max_history=200,
        save_history=True,
        history_file=None,
    ):
        """
        callback:
            main.py의 gcs_callback 같은 함수.
            callback(msg_type, data) 형태여야 함.

        max_history:
            메모리에 유지할 최대 채팅 개수.

        save_history:
            True이면 runtime/chat_history.jsonl에 채팅 저장.

        history_file:
            별도 저장 경로 지정 가능.
        """

        self.callback = callback
        self.max_history = int(max_history)
        self.save_history = bool(save_history)

        self.chat_history = deque(
            maxlen=self.max_history
        )

        self.lock = threading.RLock()

        base_dir = Path(__file__).resolve().parent

        if history_file:
            self.history_file = Path(
                history_file
            )
        else:
            runtime_dir = (
                base_dir / "runtime"
            )

            runtime_dir.mkdir(
                parents=True,
                exist_ok=True,
            )

            self.history_file = (
                runtime_dir
                / "chat_history.jsonl"
            )

        if self.save_history:
            self._load_history()


    # ========================================================
    # 공통
    # ========================================================

    def _now(self):
        return datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )


    def _emit(
        self,
        msg_type,
        data,
    ):
        """
        main.py의 callback으로 메시지를 전달.
        """

        if not self.callback:
            return

        try:
            self.callback(
                msg_type,
                data,
            )

        except Exception as e:
            print(
                f"[CHAT CALLBACK ERROR] {e}"
            )


    def _clean_text(
        self,
        text,
        max_length=500,
    ):
        """
        메시지 정리.

        - None 방지
        - 앞뒤 공백 제거
        - 제어문자 제거
        - 길이 제한
        """

        if text is None:
            return ""

        text = str(text).strip()

        text = "".join(
            ch
            for ch in text
            if ch == "\n"
            or ch == "\t"
            or ord(ch) >= 32
        )

        return text[:max_length]


    def _clean_name(
        self,
        value,
        default,
        max_length,
    ):
        value = self._clean_text(
            value,
            max_length=max_length,
        )

        return value or default


    # ========================================================
    # 일반 관제 채팅
    # ========================================================

    def send_message(
        self,
        user_id=None,
        name="Operator",
        callsign="GCS",
        message="",
        channel="GCS",
    ):
        """
        일반 관제 채팅 메시지 생성.

        반환값:
            성공 -> message_data(dict)
            실패 -> None
        """

        text = self._clean_text(
            message,
            max_length=500,
        )

        if not text:
            return None

        name = self._clean_name(
            name,
            "Operator",
            30,
        )

        callsign = self._clean_name(
            callsign,
            "GCS",
            20,
        )

        channel = self._clean_name(
            channel,
            "GCS",
            20,
        ).upper()

        message_data = {
            "id":
            str(uuid.uuid4()),

            "user_id":
            user_id,

            "name":
            name,

            "callsign":
            callsign,

            "channel":
            channel,

            "message":
            text,

            "timestamp":
            self._now(),

            "message_type":
            "USER",
        }

        self._store_message(
            message_data
        )

        # 채널에 따라 WebSocket type 결정
        if channel == "VIDEO":
            msg_type = "VIDEO_CHAT"
        else:
            msg_type = "CHAT"

        self._emit(
            msg_type,
            message_data,
        )

        return message_data


    # ========================================================
    # 영상 관제 채팅
    # ========================================================

    def send_video_message(
        self,
        user_id=None,
        name="Operator",
        callsign="GCS",
        message="",
    ):
        return self.send_message(
            user_id=user_id,
            name=name,
            callsign=callsign,
            message=message,
            channel="VIDEO",
        )


    # ========================================================
    # 시스템 메시지
    # ========================================================

    def send_system_message(
        self,
        message,
        level="INFO",
        channel="SYSTEM",
    ):
        """
        서버 / 드론 / 영상 상태 메시지용.

        level 예:
            INFO
            SUCCESS
            WARNING
            ERROR
            DANGER
        """

        text = self._clean_text(
            message,
            max_length=500,
        )

        if not text:
            return None

        level = self._clean_name(
            level,
            "INFO",
            20,
        ).upper()

        channel = self._clean_name(
            channel,
            "SYSTEM",
            20,
        ).upper()

        message_data = {
            "id":
            str(uuid.uuid4()),

            "user_id":
            None,

            "name":
            "SYSTEM",

            "callsign":
            "GCS-SYSTEM",

            "channel":
            channel,

            "message":
            text,

            "level":
            level,

            "timestamp":
            self._now(),

            "message_type":
            "SYSTEM",
        }

        self._store_message(
            message_data
        )

        self._emit(
            "SYSTEM_MESSAGE",
            message_data,
        )

        return message_data


    # ========================================================
    # 긴급 관제 메시지
    # ========================================================

    def send_alert_message(
        self,
        message,
        level="WARNING",
    ):
        """
        AI 위험감지 / 통신두절 / 배터리 경고 등에 사용.
        """

        data = self.send_system_message(
            message=message,
            level=level,
            channel="ALERT",
        )

        if data:
            self._emit(
                "CHAT_ALERT",
                data,
            )

        return data


    # ========================================================
    # 빠른 관제 메시지
    # ========================================================

    def send_quick_message(
        self,
        user_id=None,
        name="Operator",
        callsign="GCS",
        quick_type="COPY",
    ):
        """
        관제 화면의 빠른 버튼용.

        예:
            COPY
            ROGER
            HOLD
            CHECK
            EMERGENCY
        """

        quick_type = (
            str(quick_type)
            .strip()
            .upper()
        )

        quick_messages = {
            "COPY":
            "수신 확인했습니다.",

            "ROGER":
            "확인 완료.",

            "HOLD":
            "현재 위치에서 대기 바랍니다.",

            "CHECK":
            "상태 확인 바랍니다.",

            "VIDEO_CHECK":
            "영상 상태 확인 바랍니다.",

            "SIGNAL_CHECK":
            "통신 상태 확인 바랍니다.",

            "EMERGENCY":
            "긴급 상황입니다. 즉시 확인 바랍니다.",
        }

        text = quick_messages.get(
            quick_type
        )

        if not text:
            return None

        return self.send_message(
            user_id=user_id,
            name=name,
            callsign=callsign,
            message=text,
            channel="GCS",
        )


    # ========================================================
    # 메시지 저장
    # ========================================================

    def _store_message(
        self,
        message_data,
    ):
        with self.lock:
            self.chat_history.append(
                message_data
            )

            if self.save_history:
                self._append_to_file(
                    message_data
                )


    def _append_to_file(
        self,
        message_data,
    ):
        try:
            self.history_file.parent.mkdir(
                parents=True,
                exist_ok=True,
            )

            with self.history_file.open(
                "a",
                encoding="utf-8",
            ) as f:
                f.write(
                    json.dumps(
                        message_data,
                        ensure_ascii=False,
                    )
                    + "\n"
                )

        except Exception as e:
            print(
                f"[CHAT SAVE ERROR] {e}"
            )


    # ========================================================
    # 기존 기록 불러오기
    # ========================================================

    def _load_history(self):
        if not self.history_file.exists():
            return

        try:
            lines = (
                self.history_file
                .read_text(
                    encoding="utf-8"
                )
                .splitlines()
            )

            for line in lines[
                -self.max_history:
            ]:
                try:
                    data = json.loads(
                        line
                    )

                    if isinstance(
                        data,
                        dict,
                    ):
                        self.chat_history.append(
                            data
                        )

                except json.JSONDecodeError:
                    continue

        except Exception as e:
            print(
                f"[CHAT LOAD ERROR] {e}"
            )


    # ========================================================
    # 채팅 기록 조회
    # ========================================================

    def get_history(
        self,
        limit=50,
        channel=None,
    ):
        try:
            limit = int(limit)
        except Exception:
            limit = 50

        limit = max(
            1,
            min(
                limit,
                self.max_history,
            ),
        )

        with self.lock:
            data = list(
                self.chat_history
            )

        if channel:
            channel = (
                str(channel)
                .strip()
                .upper()
            )

            data = [
                item
                for item in data
                if str(
                    item.get(
                        "channel",
                        "",
                    )
                ).upper()
                == channel
            ]

        return data[-limit:]


    # ========================================================
    # 특정 메시지 조회
    # ========================================================

    def get_message(
        self,
        message_id,
    ):
        with self.lock:
            for item in reversed(
                self.chat_history
            ):
                if (
                    item.get("id")
                    == message_id
                ):
                    return item

        return None


    # ========================================================
    # 채팅 통계
    # ========================================================

    def get_stats(self):
        with self.lock:
            data = list(
                self.chat_history
            )

        user_messages = sum(
            1
            for item in data
            if item.get(
                "message_type"
            ) == "USER"
        )

        system_messages = sum(
            1
            for item in data
            if item.get(
                "message_type"
            ) == "SYSTEM"
        )

        video_messages = sum(
            1
            for item in data
            if item.get(
                "channel"
            ) == "VIDEO"
        )

        return {
            "total":
            len(data),

            "user_messages":
            user_messages,

            "system_messages":
            system_messages,

            "video_messages":
            video_messages,

            "max_history":
            self.max_history,

            "save_history":
            self.save_history,

            "history_file":
            str(
                self.history_file
            ),
        }


    # ========================================================
    # 메모리 채팅 초기화
    # ========================================================

    def clear_memory_history(self):
        """
        현재 실행 중인 메모리 기록만 삭제.
        파일 기록은 유지.
        """

        with self.lock:
            self.chat_history.clear()

        self._emit(
            "CHAT_HISTORY_CLEARED",
            {
                "timestamp":
                self._now()
            },
        )


    # ========================================================
    # 전체 기록 삭제
    # ========================================================

    def clear_all_history(self):
        """
        메모리 + JSONL 파일 기록 삭제.
        """

        with self.lock:
            self.chat_history.clear()

        try:
            if self.history_file.exists():
                self.history_file.unlink()

        except Exception as e:
            print(
                f"[CHAT DELETE ERROR] {e}"
            )

        self._emit(
            "CHAT_HISTORY_CLEARED",
            {
                "timestamp":
                self._now(),

                "file_deleted":
                True,
            },
        )