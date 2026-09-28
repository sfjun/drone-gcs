# main.py
import os
import asyncio
import json
import random
import webbrowser
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from drone_manager import DroneManager
from video_manager import VideoManager

from weather_manager import WeatherManager
from fastapi import Query
# 전역 변수 세팅
active_websockets = []
main_loop = None

async def mock_ai_risk_task():
    """가상의 AI 위험 데이터를 1초마다 전송하는 태스크"""
    while True:
        if active_websockets:
            risk_data = {
                "fire": random.randint(0, 15),
                "smoke": random.randint(5, 25),
                "person": random.randint(60, 95),
                "hotspot": random.randint(20, 40)
            }
            message = json.dumps({"type": "AI_RISK", "data": risk_data})
            
            for ws in active_websockets:
                try:
                    await ws.send_text(message)
                except Exception:
                    pass
        await asyncio.sleep(1)

def gcs_callback(msg_type, data):
    """드론 및 비디오 매니저에서 콜백 받을 때 웹소켓으로 전달"""
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

# 매니저 객체 초기화
drone = DroneManager(callback=gcs_callback)
video = VideoManager(callback=gcs_callback)

# ==========================================
# WEATHER MANAGER
# ==========================================

weather_manager = WeatherManager(
    kma_service_key=os.getenv("KMA_SERVICE_KEY"),
    cache_seconds=60,
    timeout_seconds=7
)

DEFAULT_WEATHER_LAT = 37.4563
DEFAULT_WEATHER_LON = 126.7052
DEFAULT_WEATHER_ICAO = "RKSI"

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    asyncio.create_task(mock_ai_risk_task())
    yield
    # 서버 종료 시 드론/비디오 안전하게 정지 (필요시)
    drone.stop()
    video.stop()

# FastAPI 앱 초기화
app = FastAPI(title="AI Drone GCS Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ==========================================
# WEATHER API
# ==========================================

@app.get("/api/weather/current")
async def get_weather_current(
    lat: float = Query(DEFAULT_WEATHER_LAT),
    lon: float = Query(DEFAULT_WEATHER_LON),
    icao: str = Query(DEFAULT_WEATHER_ICAO)
):
    try:
        weather = await weather_manager.get_current(
            lat=lat,
            lon=lon,
            icao=icao
        )

        return weather

    except Exception as e:
        return {
            "error": True,
            "message": str(e)
        }

# [수정됨] 만약 static 폴더(CSS/JS 등)를 따로 관리한다면 아래 주석을 풀고 사용하세요.
# 파이썬 코드가 있는 폴더를 통째로 마운트하는 것은 보안상 위험합니다.
base_dir = os.path.dirname(os.path.abspath(__file__))

# 기존의 if os.path.exists(...) 조건문을 전부 지우고, 아래 한 줄만 남깁니다.
app.mount("/static", StaticFiles(directory=base_dir), name="static")

@app.get("/")
async def get_index():
    file_path = os.path.join(base_dir, "index.html")
    if not os.path.exists(file_path):
        return {"error": f"파일을 찾을 수 없습니다: {file_path}"}
        
    return FileResponse(file_path, headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    })

# ==========================================
# 채팅 웹소켓 관리자 및 엔드포인트 추가
# ==========================================
class ChatManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # 접속할 때마다 터미널에 인원수 출력
        print(f"🟢 [채팅] 새 사용자 접속! 현재 채팅 인원: {len(self.active_connections)}명")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"🔴 [채팅] 사용자 퇴장. 남은 채팅 인원: {len(self.active_connections)}명")

    async def broadcast(self, message: str):
        # 메시지를 뿌리기 전에 터미널에 출력
        print(f"전체 전송 중 💬 : {message}")
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"⚠️ [채팅] 특정 사용자에게 전송 실패 (무시됨): {e}")

chat_manager = ChatManager()

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await chat_manager.connect(websocket)
    try:
        while True:
            # 클라이언트로부터 메시지 수신
            data = await websocket.receive_text()
            print(f"받은 데이터 📥 : {data}")
            # 모든 사람에게 전송
            await chat_manager.broadcast(data)
    # 기존 WebSocketDisconnect 대신 Exception을 사용하여 모든 튕김 현상 방지
    except Exception as e:
        print(f"⚠️ [채팅] 연결 끊김: {e}")
        chat_manager.disconnect(websocket)      

@app.websocket("/ws/drone")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    
    try:
        while True:
            command = await websocket.receive_text()
            
            if command.startswith("CONNECT:"):
                ip_val = command.split("CONNECT:")[1]
                drone.set_connection_string(ip_val)
                drone.start()
                video.start()
                
            elif command == "DISCONNECT":
                drone.stop()
                video.stop()
                
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                drone.send_command(command)
                
    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        if len(active_websockets) == 0:
            drone.stop()
            video.stop()

if __name__ == "__main__":
    import socket

    # 현재 PC의 로컬 IP 자동 검색
    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    # 접속 주소 생성
    current_ip = get_local_ip()
    url = f"http://{current_ip}:8000"

    print("\n🌐 [서버 실행됨]")
    print("스마트폰이나 다른 PC에서 접속하려면:")
    print(f"👉 {url}\n")

    # 브라우저 자동 실행
    def open_browser():
        try:
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(url)
        except Exception:
            webbrowser.open(url)

    # 1.5초 뒤 브라우저 실행
    threading.Timer(1.5, open_browser).start()

    # FastAPI 서버 실행
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False
    )