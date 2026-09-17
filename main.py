import os
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
import uvicorn
from drone_manager import DroneManager

app = FastAPI(title="AI Drone GCS Server")
active_websockets = []
main_loop = None

@app.on_event("startup")
async def on_startup():
    global main_loop
    main_loop = asyncio.get_running_loop()

# 드론에서 데이터가 올라오면 웹 브라우저로 쏴주는 콜백 함수
def drone_callback(msg_type, data):
    message = json.dumps({"type": msg_type, "data": data})
    if main_loop and main_loop.is_running():
        for ws in active_websockets:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), main_loop)

# 드론 객체 생성
drone = DroneManager(callback=drone_callback)

@app.get("/")
async def get_index():
    # 경로 문제로 인한 500 에러를 방지하는 안전한 파일 서빙 로직
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_dir, "index.html")
    
    if not os.path.exists(file_path):
        return {"error": f"파일을 찾을 수 없습니다: {file_path}"}
        
    return FileResponse(file_path)

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
            elif command == "DISCONNECT":
                drone.stop()
            elif command in ["ARM", "DISARM", "TAKEOFF", "LAND"]:
                drone.send_command(command)
                
    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        if len(active_websockets) == 0:
            drone.stop()

if __name__ == "__main__":
    # 이 부분이 있어야 python main.py 로 실행 시 외부 접속이 허용됩니다.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)