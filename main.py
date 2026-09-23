# main.py
import os
import asyncio
import json
import random
import webbrowser
import threading
import subprocess
import ctypes
import sys
import socket
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from drone_manager import DroneManager
from video_manager import VideoManager


# ==========================================
# [통합 관리] 전역 변수 및 매니저 설정
# ==========================================
# 1. 메인 관제 센터용 (index.html)
main_active_websockets = []
main_loop = None

# 2. 서브 출동 소방차용 (car_index.html)
car_active_websockets = []

# 콜백 함수들
def main_gcs_callback(msg_type, data):
    """메인 관제 센터 웹소켓 전달 콜백"""
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in main_active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

def car_gcs_callback(msg_type, data):
    """서브 출동 소방차 웹소켓 전달 콜백"""
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in car_active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

# 매니저 객체 초기화 (메인과 서브가 각각의 기기를 제어하도록 분리)
main_drone = DroneManager(callback=main_gcs_callback)
main_video = VideoManager(callback=main_gcs_callback)

car_drone = DroneManager(callback=car_gcs_callback)
car_video = VideoManager(callback=car_gcs_callback)


# ==========================================
# [통합 관리] 가상 백그라운드 태스크
# ==========================================
async def mock_ai_risk_task():
    """메인과 서브 웹소켓 모두에 가상의 AI 위험 데이터를 1초마다 전송"""
    while True:
        risk_data = {
            "fire": random.randint(0, 15),
            "smoke": random.randint(5, 25),
            "person": random.randint(60, 95),
            "hotspot": random.randint(20, 40)
        }
        message = json.dumps({"type": "AI_RISK", "data": risk_data})
        
        # 메인 웹소켓 전송
        for ws in main_active_websockets:
            try:
                await ws.send_text(message)
            except Exception:
                pass
                
        # 서브 웹소켓 전송
        for ws in car_active_websockets:
            try:
                await ws.send_text(message)
            except Exception:
                pass
                
        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    asyncio.create_task(mock_ai_risk_task())
    yield
    # 서버 종료 시 안전하게 정지
    main_drone.stop()
    main_video.stop()
    car_drone.stop()
    car_video.stop()

# FastAPI 앱 초기화
app = FastAPI(title="소방 관제 시스템 통합 서버", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

base_dir = os.path.dirname(os.path.abspath(__file__))
# [주의] 이 디렉토리 자체를 static으로 마운트하면 파이썬 코드가 노출되므로, 
# HTML 내 static 리소스(css, js, 이미지 등) 접근용으로만 사용되게 둡니다.
app.mount("/static", StaticFiles(directory=base_dir), name="static")


# ==========================================
# [HTTP 라우팅] 메인 화면 및 서브 화면 페이지 매핑
# ==========================================
@app.get("/")
async def get_main_index():
    """초기 화면: 소방 관제 센터 (index.html)"""
    file_path = os.path.join(base_dir, "index.html")
    if not os.path.exists(file_path):
        return {"error": f"메인 화면 파일을 찾을 수 없습니다: {file_path}"}
    return FileResponse(file_path, headers={"Cache-Control": "no-cache"})

# car_url=""

# main.py 내부의 해당 API 수정
@app.get("/open-car-app")
async def open_car_app_endpoint():
    def launch_chrome():
        try:
            import ctypes
            import subprocess
            
            # 1. 모니터 해상도 구하기 및 크기 계산
            user32 = ctypes.windll.user32
            monitor_width = user32.GetSystemMetrics(0)
            monitor_height = user32.GetSystemMetrics(1)

            win_width = int(monitor_width * 0.5)
            win_height = int(monitor_height * 0.5)
            left_position = int((monitor_width - win_width) / 2)
            top_position = int((monitor_height - win_height) / 2)


            # 2. 정확한 로컬 호스트 주소(127.0.0.1:8000/car) 지정
            # 주소가 절대로 127.0.0.0으로 바뀌지 않도록 문자열을 고정합니다.
            car_url = "http://127.0.0.1:8000/car"
            
            args = [
                "C:/Program Files/Google/Chrome/Application/chrome.exe",
                f"--app={car_url}",
                f"--window-size={win_width},{win_height}",
                f"--window-position={left_position},{top_position}"
            ]
            subprocess.Popen(args)
        except Exception as e:
            print(f"❌ 크롬 백그라운드 실행 실패: {e}")

    # 브라우저 멈춤 방지를 위해 스레드로 실행 후 즉시 성공 응답 반환
    import threading
    threading.Thread(target=launch_chrome, daemon=True).start()
    
    return {"status": "success", "message": "앱 실행 명령을 전달했습니다."}

@app.get("/car")
async def get_car_index():
    """서브 화면: 출동 소방차 (car_index.html)"""
    file_path = os.path.join(base_dir, "car_index.html")
    if not os.path.exists(file_path):
        return {"error": f"서브 화면 파일을 찾을 수 없습니다: {file_path}"}
    return FileResponse(file_path, headers={"Cache-Control": "no-cache"})


# ==========================================
# [채팅 웹소켓] 공통 관리자
# ==========================================
class ChatManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"🟢 [채팅] 새 사용자 접속! 현재 채팅 인원: {len(self.active_connections)}명")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"🔴 [채팅] 사용자 퇴장. 남은 채팅 인원: {len(self.active_connections)}명")

    async def broadcast(self, message: str):
        print(f"전체 전송 중 💬 : {message}")
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"⚠️ [채팅] 전송 실패 무시: {e}")

chat_manager = ChatManager()

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await chat_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"받은 데이터 📥 : {data}")
            await chat_manager.broadcast(data)
    except Exception as e:
        print(f"⚠️ [채팅] 연결 끊김: {e}")
        chat_manager.disconnect(websocket)      


# ==========================================
# [드론 제어 웹소켓] 메인 및 서브 분리 등록
# ==========================================
# 1. 소방 관제 센터용 드론 웹소켓 (/ws/drone)
@app.websocket("/ws/drone")
async def main_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    main_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                ip_val = command.split("CONNECT:")[1]
                main_drone.set_connection_string(ip_val)
                main_drone.start()
                main_video.start()
            elif command == "DISCONNECT":
                main_drone.stop()
                main_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                main_drone.send_command(command)
    except WebSocketDisconnect:
        main_active_websockets.remove(websocket)
        if len(main_active_websockets) == 0:
            main_drone.stop()
            main_video.stop()

# 2. 출동 소방차용 드론 웹소켓 (/ws/car/drone)
@app.websocket("/ws/car/drone")
async def car_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    car_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                ip_val = command.split("CONNECT:")[1]
                car_drone.set_connection_string(ip_val)
                car_drone.start()
                car_video.start()
            elif command == "DISCONNECT":
                car_drone.stop()
                car_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                car_drone.send_command(command)
    except WebSocketDisconnect:
        car_active_websockets.remove(websocket)
        if len(car_active_websockets) == 0:
            car_drone.stop()
            car_video.stop()


# ==========================================
# [서버 실행 및 브라우저 자동 오픈]
# ==========================================
if __name__ == "__main__":
    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    current_ip = get_local_ip()
    main_url = f"http://{current_ip}:8000"
    car_url = f"http://{current_ip}:8000/car"
    
    print(f"\n🌐 [통합 서버 실행됨]")
    print(f"👉 초기 화면 (소방 관제 센터) : {main_url}")
    print(f"👉 서브 화면 (출동 소방차)     : {car_url}\n")

    # 브라우저 실행 함수 (요청에 따라 초기 화면 'main_url' 딱 하나만 열리도록 수정)
    def open_main_browser_only():
        try:
            # 크롬 브라우저로 초기 화면(index.html) 딱 하나만 자동으로 띄웁니다.
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(main_url)
            print(f"🌐 [자동 실행] 초기 화면(관제 센터)을 크롬으로 열었습니다.")
            print(f"💡 서브 화면(출동 소방차)은 브라우저에서 직접 {car_url} 주소로 접속해 주세요.")
        except Exception as e:
            print(f"❌ 브라우저 자동 실행 실패 기본 연결 시도: {e}", file=sys.stderr)
            webbrowser.open(main_url)

    # 1.5초 뒤 메인 브라우저 딱 하나만 실행
    threading.Timer(1.5, open_main_browser_only).start()

    # 8000번 단일 포트로 실행
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, ws="wsproto")