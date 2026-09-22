import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from adapters.mavlink_adapter import MavlinkAdapter
from core.config import settings
from services.incidents import IncidentService
from services.telemetry import TelemetryStore
from services.weather_service import WeatherService

BASE_DIR = Path(__file__).resolve().parent
clients: set[WebSocket] = set()
telemetry = TelemetryStore(settings.default_lat, settings.default_lon)
weather_service = WeatherService()
incident_service = IncidentService()


async def broadcast(message_type: str, data: Any) -> None:
    message = json.dumps({"type": message_type, "data": data}, ensure_ascii=False)
    stale: list[WebSocket] = []
    for client in clients.copy():
        try:
            await client.send_text(message)
        except Exception:
            stale.append(client)
    for client in stale:
        clients.discard(client)


def adapter_event(message_type: str, data: dict | str) -> None:
    """기존 드론 스레드에서 들어온 이벤트를 FastAPI 이벤트 루프로 안전하게 전달한다."""
    loop = app.state.loop
    if message_type == "CONNECTION":
        telemetry.update(data if isinstance(data, dict) else {})
    elif message_type in {"TELEMETRY", "STATUS"} and isinstance(data, dict):
        telemetry.update(data)
    elif message_type in {"AI_RISK", "AI_DETECTION"}:
        message_type = "AI_RISK"
    asyncio.run_coroutine_threadsafe(broadcast(message_type, data), loop)


adapter = MavlinkAdapter(adapter_event, settings.demo_mode)


async def periodic_updates() -> None:
    tick = 0
    while True:
        if settings.demo_mode:
            await broadcast("TELEMETRY", telemetry.demo_tick())
        if tick % max(1, settings.weather_refresh_seconds) == 0:
            state = telemetry.snapshot()
            weather = await weather_service.current(state["lat"], state["lon"], settings.weather_refresh_seconds)
            await broadcast("WEATHER", weather)
        tick += 1
        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.loop = asyncio.get_running_loop()
    task = asyncio.create_task(periodic_updates())
    yield
    task.cancel()


app = FastAPI(title="AI Drone GCS Situation Room", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "static" / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/health")
async def health():
    return {"status": "ok", "demo_mode": settings.demo_mode, "clients": len(clients)}


@app.get("/api/incidents")
async def incidents():
    return incident_service.list()


async def send_initial_state(socket: WebSocket) -> None:
    await socket.send_json({"type": "TELEMETRY", "data": telemetry.snapshot()})
    state = telemetry.snapshot()
    await socket.send_json({"type": "WEATHER", "data": await weather_service.current(state["lat"], state["lon"], 0)})
    await socket.send_json({"type": "INCIDENTS", "data": incident_service.list()})


@app.websocket("/ws/gcs")
async def gcs_socket(socket: WebSocket):
    await socket.accept()
    clients.add(socket)
    await send_initial_state(socket)
    try:
        while True:
            raw = await socket.receive_text()
            message = json.loads(raw)
            kind, payload = message.get("type"), message.get("data", {})
            if kind == "CONNECT":
                connection = payload.get("connection_string", settings.default_connect_string)
                adapter.connect(connection)
                await broadcast("TELEMETRY", telemetry.snapshot())
            elif kind == "DISCONNECT":
                adapter.disconnect()
                await broadcast("TELEMETRY", telemetry.snapshot())
            elif kind == "COMMAND":
                command = payload.get("command", "")
                if command not in {"ARM", "DISARM", "TAKEOFF", "LAND", "EMERGENCY_STOP"}:
                    await socket.send_json({"type": "ERROR", "data": "허용되지 않은 기체 명령입니다."})
                    continue
                telemetry.update({"armed": command == "ARM" or (telemetry.snapshot()["armed"] and command not in {"DISARM", "EMERGENCY_STOP"}),
                                  "mode": "LAND" if command == "LAND" else "GUIDED" if command == "TAKEOFF" else telemetry.snapshot()["mode"]})
                adapter.command(command)
                await broadcast("TELEMETRY", telemetry.snapshot())
            elif kind == "CHAT":
                chat = {"author": str(payload.get("author", "운영자"))[:40], "text": str(payload.get("text", ""))[:500]}
                if chat["text"].strip():
                    await broadcast("CHAT", chat)
            elif kind == "INCIDENT":
                item = incident_service.add(str(payload.get("title", "상황 기록")), str(payload.get("level", "CAUTION")),
                                            str(payload.get("author", "운영자")), str(payload.get("note", "")))
                await broadcast("INCIDENT", item)
            elif kind == "REFRESH_WEATHER":
                state = telemetry.snapshot()
                weather = await weather_service.current(state["lat"], state["lon"], 0)
                await broadcast("WEATHER", weather)
    except (WebSocketDisconnect, json.JSONDecodeError):
        clients.discard(socket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
