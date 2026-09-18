# main.py
import os
import asyncio
import json
import random
import webbrowser  # 👈 브라우저 자동 실행을 위해 추가된 임포트
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from drone_manager import DroneManager
from video_manager import VideoManager

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    asyncio.create_task(mock_ai_risk_task())
    yield

app = FastAPI(title="AI Drone GCS Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 👇 현재 폴더를 '/static' 경로로 마운트하여 CSS, JS 파일을 브라우저에 제공합니다.
base_dir = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=base_dir), name="static")

active_websockets = []
main_loop = None

async def mock_ai_risk_task():
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
                except:
                    pass
        await asyncio.sleep(1)

def gcs_callback(msg_type, data):
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

drone = DroneManager(callback=gcs_callback)
video = VideoManager(callback=gcs_callback)

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
    
    # 👇 여기서부터 try - except 들여쓰기 라인을 정확하게 맞췄습니다!
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
    url = "http://localhost:8000"

    # 👇 브라우저를 여는 동작을 함수로 묶습니다.
    def open_browser():
        try:
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
            webbrowser.get(chrome_path).open(url)
        except:
            webbrowser.open(url)

    # 👇 서버 실행을 방해하지 않고 1.5초 뒤에 브라우저만 엽니다. (시간은 1~2초 사이로 조절 가능)
    threading.Timer(1.5, open_browser).start()

    # 서버 실행 (이 코드가 타이머 대기 없이 바로 실행되어야 합니다)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, ws="wsproto")