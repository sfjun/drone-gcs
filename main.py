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
import signal
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
# [통합 관리] 전역 변수 및 단일 매니저 설정
# ==========================================
main_active_websockets = []
car_active_websockets = []
main_loop = None

# 통합 콜백 함수: 관제 센터와 소방차 모두에게 동일한 데이터를 뿌려줍니다.
def global_gcs_callback(msg_type, data):
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        # 메인 웹소켓과 서브 웹소켓을 합쳐서 브로드캐스트
        all_websockets = main_active_websockets + car_active_websockets
        for ws in all_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

# 💡 핵심 수정: 매니저 객체를 하나로 통합하여 포트 충돌을 방지합니다.
shared_drone = DroneManager(callback=global_gcs_callback)
shared_video = VideoManager(callback=global_gcs_callback)


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
        
        all_websockets = main_active_websockets + car_active_websockets
        for ws in all_websockets:
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
    shared_drone.stop()
    shared_video.stop()

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
app.mount("/static", StaticFiles(directory=base_dir), name="static")


# ==========================================
# [HTTP 라우팅] 메인 화면 및 서브 화면 페이지 매핑
# ==========================================
@app.get("/")
async def get_main_index():
    file_path = os.path.join(base_dir, "index.html")
    if not os.path.exists(file_path):
        return {"error": f"메인 화면 파일을 찾을 수 없습니다: {file_path}"}
    return FileResponse(file_path, headers={"Cache-Control": "no-cache"})

@app.get("/open-car-app")
async def open_car_app_endpoint():
    def launch_chrome():
        try:
            user32 = ctypes.windll.user32
            monitor_width = user32.GetSystemMetrics(0)
            monitor_height = user32.GetSystemMetrics(1)

            win_width = int(monitor_width * 0.5)
            win_height = int(monitor_height * 0.5)
            left_position = int((monitor_width - win_width) / 2)
            top_position = int((monitor_height - win_height) / 2)

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

    threading.Thread(target=launch_chrome, daemon=True).start()
    return {"status": "success", "message": "앱 실행 명령을 전달했습니다."}

@app.get("/car")
async def get_car_index():
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
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                pass

chat_manager = ChatManager()

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await chat_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await chat_manager.broadcast(data)
    except Exception as e:
        chat_manager.disconnect(websocket)
        
        async def delayed_shutdown():
            await asyncio.sleep(1.0)
            current_count = len(getattr(chat_manager, 'active_connections', []))
            if current_count == 0:
                print("INFO: 채팅 인원이 0명입니다. 서버는 유지됩니다.")        
            else:
                print(f"INFO: 서버 유지. (현재 채팅 인원: {current_count}명)")
        asyncio.create_task(delayed_shutdown())
        
# ==========================================
# [드론 제어 웹소켓] 메인 및 서브 공통 통제
# ==========================================
@app.websocket("/ws/drone")
async def main_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    main_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                ip_val = command.split("CONNECT:")[1]
                shared_drone.set_connection_string(ip_val)
                if not shared_drone.running:
                    shared_drone.start()
                if getattr(shared_video, 'pipeline', None) is None:
                    shared_video.start()
            elif command == "DISCONNECT":
                shared_drone.stop()
                shared_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                shared_drone.send_command(command)
    except WebSocketDisconnect:
        main_active_websockets.remove(websocket)
        if len(main_active_websockets) == 0 and len(car_active_websockets) == 0:
            shared_drone.stop()
            shared_video.stop()
        print("INFO: 관제 센터 화면 닫힘. (서버 유지)")            


@app.websocket("/ws/car/drone")
async def car_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    car_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                ip_val = command.split("CONNECT:")[1]
                shared_drone.set_connection_string(ip_val)
                if not shared_drone.running:
                    shared_drone.start()
                if getattr(shared_video, 'pipeline', None) is None:
                    shared_video.start()
            elif command == "DISCONNECT":
                shared_drone.stop()
                shared_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                shared_drone.send_command(command)
    except WebSocketDisconnect:
        car_active_websockets.remove(websocket)
        if len(main_active_websockets) == 0 and len(car_active_websockets) == 0:
            shared_drone.stop()
            shared_video.stop()
        print("INFO: 소방차 화면 닫힘. (서버 유지)")               
    

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

    def open_main_browser_only():
        try:
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(main_url)
            print(f"🌐 [자동 실행] 초기 화면(관제 센터)을 크롬으로 열었습니다.")
        except Exception as e:
            webbrowser.open(main_url)

    threading.Timer(1.5, open_main_browser_only).start()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, ws="wsproto")