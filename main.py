# main.py
import os
import glob
import asyncio
import json
import random
import webbrowser
import threading
import subprocess
import platform
import socket
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from pydantic import BaseModel
from datetime import datetime

from weather_manager import WeatherManager
from drone_manager import DroneManager
from video_manager import VideoManager

def cleanup_old_logs(log_dir="logs", max_files=50):
    if not os.path.exists(log_dir):
        return
    files = [os.path.join(log_dir, f) for f in os.listdir(log_dir) if os.path.isfile(os.path.join(log_dir, f))]
    if len(files) > max_files:
        files.sort(key=os.path.getmtime)
        files_to_delete = len(files) - max_files
        for i in range(files_to_delete):
            try:
                os.remove(files[i])
                print(f"🗑️ 오래된 로그 자동 삭제: {files[i]}")
            except Exception as e:
                pass

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

HOST_IP = get_local_ip()

# ==========================================
# [모드 선택] 한 번만 실행되도록 안전하게 배치
# ==========================================
print("\n=======================================")
print("🚁 소방 관제 센터 서버를 시작합니다.")
print("1. [테스트 모드] 가상 시뮬레이터(SITL) 구동")
print("2. [실전 모드] 실제 드론 연결 (시뮬레이터 끄기)")
print("=======================================\n")

choice = input("👉 원하시는 모드의 번호를 입력하세요 (1 또는 2): ")
USE_SITL = (choice == "1")

# ==========================================
# [통합 관리] 전역 변수 및 단일 매니저 설정
# ==========================================
last_gps_cache = None
main_active_websockets = []
car_active_websockets = []
main_loop = None
sitl_process = None

def global_gcs_callback(msg_type, data):
    global last_gps_cache
    if msg_type == "GPS":
        current_gps = f"{data['lat']}_{data['lon']}_{data['alt']}"
        if current_gps == last_gps_cache:
            return
        last_gps_cache = current_gps

    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        all_websockets = main_active_websockets + car_active_websockets
        for ws in all_websockets:
            try:
                asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)
            except Exception:
                pass

shared_drone = DroneManager(callback=global_gcs_callback)
shared_video = VideoManager(callback=global_gcs_callback)
weather_mgr = WeatherManager(kma_service_key="7d0fa779fe54dad96be36fa5ef4408a738ca9aad25554a116a19f3763d5e5348")

# ==========================================
# [최신 FastAPI Lifespan 이벤트 관리]
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop, sitl_process
    cleanup_old_logs(log_dir="logs", max_files=50)
    main_loop = asyncio.get_running_loop()
    asyncio.create_task(mock_ai_risk_task())
    
    if USE_SITL:
        home_coords = "37.46069,126.91950,50,0"
        try:
            if platform.system() == "Windows":
                sitl_cmd = f'start cmd /k wsl bash -ic "source ~/venv-ardupilot/bin/activate && python3 ~/ardupilot/Tools/autotest/sim_vehicle.py -v ArduCopter -f quad --out={HOST_IP}:14550 --custom-location={home_coords}"'
                sitl_process = subprocess.Popen(sitl_cmd, shell=True)
            else:
                sitl_cmd = [
                    "sim_vehicle.py", "-v", "ArduCopter", "-f", "quad", 
                    f"--out={HOST_IP}:14550", f"--custom-location={home_coords}", "--console", "--map"
                ]
                sitl_process = subprocess.Popen(sitl_cmd)
            print(f"INFO: 🚀 SITL 시뮬레이터 실행 완료 (연결 대상 IP: {HOST_IP})")
        except Exception as e:
            print(f"WARN: 시뮬레이터 자동 실행 실패: {e}")
    else:
        print("INFO: 📡 [실전 모드] 시뮬레이터를 켜지 않고 관제 서버만 실행합니다.")
        
    yield  
    
    shared_drone.stop()
    shared_video.stop()
    if sitl_process:
        sitl_process.terminate()

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

async def mock_ai_risk_task():
    while True:
        risk_data = {
            "fire": random.randint(0, 15),
            "smoke": random.randint(5, 25),
            "person": random.randint(60, 95),
            "hotspot": random.randint(20, 40)
        }
        message = json.dumps({"type": "AI_RISK", "data": risk_data})
        
        for ws in (main_active_websockets + car_active_websockets):
            try:
                await ws.send_text(message)
            except Exception:
                pass
        await asyncio.sleep(1)

# ==========================================
# [신규] 고도화된 라즈베리파이 AI 이벤트 수신 모델
# ==========================================
class PersonCoordinate(BaseModel):
    box_2d: Optional[List[int]] = None
    center: Optional[List[int]] = None
    confidence: float

class AIEvent(BaseModel):
    event_type: str
    detected_count: int
    highest_confidence: float
    people_coordinates: List[PersonCoordinate] = []
    message: str
    telemetry: Optional[Dict[str, Any]] = None

@app.post("/api/ai_event")
async def receive_ai_event(event: AIEvent):
    time_str = datetime.now().strftime("%H:%M:%S")
    print(f"🚨 [{time_str}] AI 알림 수신: {event.message} (감지 수: {event.detected_count}명)")
    
    # 웹소켓으로 프론트엔드 화면에 전달할 패킷 구성 (✨ coordinates 추가 완료!)
    msg = json.dumps({
        "type": "AI_EVENT",
        "data": {
            "type": event.event_type,
            "msg": event.message,
            "conf": event.highest_confidence,
            "count": event.detected_count,
            "coordinates": [c.dict() for c in event.people_coordinates], # ✨ 이 부분이 추가되어야 합니다!
            "time": time_str
        }
    })
    
    for ws in (main_active_websockets + car_active_websockets):
        try:
            await ws.send_text(msg)
        except Exception:
            pass
            
    return {"status": "success", "received_msg": event.message}

# ==========================================
# [HTTP 라우팅 & 웹소켓 처리]
# ==========================================
@app.get("/")
async def get_main_index(request: Request):
    # 수정된 딱 한 줄: 접속 정보가 None일 경우를 대비한 안전장치
    client_ip = request.client.host if request.client else "127.0.0.1"
    
    print(f"👀 접속 감지 - 접속 IP: {client_ip}")

    # 1. 서버를 돌리고 있는 '내 노트북'인지 확인 (127.0.0.1 이거나 내 IP)
    if client_ip in ["127.0.0.1", "localhost", HOST_IP]:
        return FileResponse(os.path.join(base_dir, "index.html"), headers={"Cache-Control": "no-cache"})
    
    # 2. 다른 기기(다른 IP)에서 접속한 경우
    else:
        return RedirectResponse(url="/car")

@app.get("/car")
async def get_car_index():
    return FileResponse(os.path.join(base_dir, "car_index.html"), headers={"Cache-Control": "no-cache"})

@app.get("/api/weather")
async def get_weather(lat: float = 37.5665, lon: float = 126.9780, icao: str | None = None):
    return await weather_mgr.get_current(lat, lon, icao=icao)

class ChatManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

chat_manager = ChatManager()

@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await chat_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await chat_manager.broadcast(data)
    except Exception:
        chat_manager.disconnect(websocket)

async def handle_drone_command(command: str):
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
    elif command in ["ARM", "DISARM", "TAKEOFF", "LAND", "BRAKE", "RTH"] or command.startswith("RC_") or command.startswith("FLY_TO:") or command.startswith("MISSION:"):
        shared_drone.send_command(command)

@app.websocket("/ws/drone")
async def main_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    main_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            await handle_drone_command(command)
    except WebSocketDisconnect:
        main_active_websockets.remove(websocket)
        if not main_active_websockets and not car_active_websockets:
            shared_drone.stop()
            shared_video.stop()

@app.websocket("/ws/car/drone")
async def car_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    car_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            await handle_drone_command(command)
    except WebSocketDisconnect:
        car_active_websockets.remove(websocket)
        if not main_active_websockets and not car_active_websockets:
            shared_drone.stop()
            shared_video.stop()

if __name__ == "__main__":
    main_url = f"http://{HOST_IP}:8000"
    car_url = f"http://{HOST_IP}:8000/car"
    
    print(f"\n🌐 [통합 서버 실행 대기중...]")
    print(f"👉 초기 화면 : {main_url}")
    print(f"👉 서브 화면 : {car_url}\n")

    def open_main_browser_only():
        try:
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(main_url)
        except Exception:
            webbrowser.open(main_url)

    threading.Timer(1.5, open_main_browser_only).start()
    
    # 중복 실행 방지를 위해 문자열 대신 app 객체를 직접 전달
    uvicorn.run(app, host="0.0.0.0", port=8000, ws="wsproto")