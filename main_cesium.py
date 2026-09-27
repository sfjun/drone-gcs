# main_cesium.py
import os, asyncio, json, random, webbrowser, threading, subprocess, ctypes, sys, socket, signal
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from drone_manager import DroneManager
from video_manager import VideoManager
from geopy.geocoders import Nominatim

main_active_websockets = []
main_loop = None
car_active_websockets = []

def main_gcs_callback(msg_type, data):
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in main_active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

def car_gcs_callback(msg_type, data):
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in car_active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

main_drone = DroneManager(callback=main_gcs_callback)
main_video = VideoManager(callback=main_gcs_callback)
car_drone = DroneManager(callback=car_gcs_callback)
car_video = VideoManager(callback=car_gcs_callback)

async def mock_ai_risk_task():
    while True:
        risk_data = {
            "fire": random.randint(0, 15), "smoke": random.randint(5, 25),
            "person": random.randint(60, 95), "hotspot": random.randint(20, 40)
        }
        message = json.dumps({"type": "AI_RISK", "data": risk_data})
        for ws in main_active_websockets + car_active_websockets:
            try: await ws.send_text(message)
            except Exception: pass
        await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    asyncio.create_task(mock_ai_risk_task())
    yield
    main_drone.stop(); main_video.stop(); car_drone.stop(); car_video.stop()

app = FastAPI(title="GCS 소방 관제 시스템 통합 서버", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
base_dir = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=base_dir), name="static")

@app.get("/api/gcs/search")
async def gcs_realtime_geocoder(query: str = Query(..., description="GCS 검색창 입력값")):
    try:
        # 역지오코딩(위경도 -> 주소) 및 정지오코딩(주소 -> 위경도) 교차 지원
        geolocator = Nominatim(user_agent="fire_gcs_cesium_system_v3")
        if ',' in query:
            # 위도, 경도 역산 주소 찾기 연동
            location = geolocator.reverse(query)
        else:
            location = geolocator.geocode(query)
            
        if location:
            return {"status": "OK", "lon": location.longitude, "lat": location.latitude, "display_name": location.address}
        return {"status": "NOT_FOUND"}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}

@app.get("/")
async def get_main_index():
    return FileResponse(os.path.join(base_dir, "index_cesium.html"), headers={"Cache-Control": "no-cache"})

@app.get("/open-car-app")
async def open_car_app_endpoint():
    def launch_chrome():
        try:
            user32 = ctypes.windll.user32
            win_width, win_height = int(user32.GetSystemMetrics(0)*0.5), int(user32.GetSystemMetrics(1)*0.5)
            left_pos, top_pos = int((user32.GetSystemMetrics(0)-win_width)/2), int((user32.GetSystemMetrics(1)-win_height)/2)
            subprocess.Popen(["C:/Program Files/Google/Chrome/Application/chrome.exe", f"--app=http://127.0.0.1:8000/car", f"--window-size={win_width},{win_height}", f"--window-position={left_pos},{top_pos}"])
        except Exception as e: print(f"❌ 크롬 실행 실패: {e}")
    threading.Thread(target=launch_chrome, daemon=True).start()
    return {"status": "success"}

@app.get("/car")
async def get_car_index():
    return FileResponse(os.path.join(base_dir, "car_index.html"), headers={"Cache-Control": "no-cache"})

class ChatManager:
    def __init__(self): self.active_connections: List[WebSocket] = []
    async def connect(self, websocket: WebSocket):
        await websocket.accept(); self.active_connections.append(websocket)
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections: self.active_connections.remove(websocket)
    async def broadcast(self, message: str):
        for conn in self.active_connections:
            try: await conn.send_text(message)
            except Exception: pass

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
        async def delayed_shutdown():
            await asyncio.sleep(1.0)
            if (len(chat_manager.active_connections) if hasattr(chat_manager, 'active_connections') else 0) == 0:
                os.kill(os.getpid(), signal.SIGINT)
        asyncio.create_task(delayed_shutdown())

@app.websocket("/ws/drone")
async def main_websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); main_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                main_drone.set_connection_string(command.split("CONNECT:")[1]); main_drone.start(); main_video.start()
            elif command == "DISCONNECT": main_drone.stop(); main_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]: main_drone.send_command(command)
    except WebSocketDisconnect:
        main_active_websockets.remove(websocket)
        if len(main_active_websockets) == 0:
            main_drone.stop(); main_video.stop(); os.kill(os.getpid(), signal.SIGINT)

@app.websocket("/ws/car/drone")
async def car_websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); car_active_websockets.append(websocket)
    try:
        while True:
            command = await websocket.receive_text()
            if command.startswith("CONNECT:"):
                car_drone.set_connection_string(command.split("CONNECT:")[1]); car_drone.start(); car_video.start()
            elif command == "DISCONNECT": car_drone.stop(); car_video.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]: car_drone.send_command(command)
    except WebSocketDisconnect:
        car_active_websockets.remove(websocket)
        if len(car_active_websockets) == 0:
            car_drone.stop(); car_video.stop(); os.kill(os.getpid(), signal.SIGINT)

if __name__ == "__main__":
    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]; s.close(); return ip
        except Exception: return "127.0.0.1"
    main_url = f"http://{get_local_ip()}:8000"
    print(f"\n🌐 [GCS 통합 관제 서버 가동 시작] -> 주소: {main_url}\n")
    
    # threading.Timer(1.5, lambda: webbrowser.open(main_url)).start()
    
    def launch_main_in_chrome():
        try:
            # 시스템에 등록된 크롬 브라우저를 찾아 강제로 실행합니다.
            chrome = webbrowser.get('chrome')
            chrome.open(main_url)
        except Exception:
            # 크롬 등록을 찾지 못했을 때의 예외 처리 (기본 경로 추적)
            import subprocess
            chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe"
            if os.path.exists(chrome_path):
                subprocess.Popen([chrome_path, main_url])
            else:
                webbrowser.open(main_url) # 최후의 수단으로 기본 브라우저 오픈

    threading.Timer(1.5, launch_main_in_chrome).start()

    uvicorn.run("main_cesium:app", host="0.0.0.0", port=8000, reload=False, ws="wsproto")
