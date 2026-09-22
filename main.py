import os
import asyncio
import json
import random
import webbrowser
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from drone_manager import DroneManager
from video_manager import VideoManager

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

base_dir = os.path.dirname(os.path.abspath(__file__))

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

    # 👇 자동으로 현재 연결된 와이파이/랜선(로컬) IP를 찾아내는 함수
    def get_local_ip():
        try:
            # 구글 DNS 서버로 연결을 시도하는 척하면서 현재 사용 중인 내 IP를 알아냅니다.
            # (실제로 데이터를 보내지는 않으므로 매우 빠르고 안전합니다)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            # 인터넷이 아예 안 끊겨있는 오프라인 상태라면 기본 주소 반환
            return "127.0.0.1"

    # 자동으로 찾은 IP를 url에 적용
    current_ip = get_local_ip()
    url = f"http://{current_ip}:8000"
    
    print(f"\n🌐 [서버 실행됨] 스마트폰이나 다른 PC에서 접속하려면 아래 주소를 입력하세요:")
    print(f"👉 {url}\n")

    def open_browser():
        try:
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(url)
        except Exception:
            webbrowser.open(url)

    # 1.5초 뒤 브라우저 실행
    threading.Timer(1.5, open_browser).start()

    # 서버 실행 (host="0.0.0.0"은 '어떤 IP로 들어오든 다 받아주겠다'는 뜻이므로 수정할 필요 없습니다)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, ws="wsproto")