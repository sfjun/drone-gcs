"""화재 드론 통합 관제 서버: 기상·공역·NOTAM·지도 화면을 한 번에 제공한다."""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from weather_manager import OFFICIAL_PORTALS, WeatherManager

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
TEMPLATE_DIR = BASE_DIR / "templates"
AIRSPACE_LAYERS = {
    "prohibited": {"data": "LT_C_AISPRHC", "title": "비행금지구역", "color": "#ff244f"},
    "restricted": {"data": "LT_C_AISRESC", "title": "비행제한구역", "color": "#ff8a00"},
    "control": {"data": "LT_C_AISCTRC", "title": "관제권", "color": "#45bfff"},
    "danger": {"data": "LT_C_AISDNGC", "title": "위험구역", "color": "#c65cff"},
    "military": {"data": "LT_C_AISMOAC", "title": "군작전구역", "color": "#ff6238"},
    "ua": {"data": "LT_C_AISUAC", "title": "초경량비행장치공역", "color": "#35db7c"},
    "consult": {"data": "LT_C_AISPCA", "title": "사전협의구역", "color": "#ffd43b"},
}
weather = WeatherManager(os.getenv("KMA_SERVICE_KEY"))
drone_sockets: set[WebSocket] = set()
chat_sockets: set[WebSocket] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    for socket in tuple(drone_sockets | chat_sockets):
        try:
            await socket.close()
        except RuntimeError:
            pass


app = FastAPI(title="FIRE DRONE GCS", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
async def dashboard() -> FileResponse:
    return FileResponse(TEMPLATE_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/car")
async def car_dashboard() -> FileResponse:
    return FileResponse(TEMPLATE_DIR / "car_index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/config/client")
async def client_config() -> dict[str, Any]:
    return {
        "kakao_javascript_key": os.getenv("KAKAO_JAVASCRIPT_KEY", ""),
        "default_location": {"lat": float(os.getenv("WEATHER_LAT", "37.4563")), "lon": float(os.getenv("WEATHER_LON", "126.7052")), "icao": os.getenv("WEATHER_ICAO", "RKSI")},
        "notam_default_url": os.getenv("NOTAM_DEFAULT_URL", OFFICIAL_PORTALS["korea_notam"]),
        "official_links": OFFICIAL_PORTALS,
    }


@app.get("/api/weather/current")
async def weather_current(lat: float = Query(float(os.getenv("WEATHER_LAT", "37.4563")), ge=-90, le=90), lon: float = Query(float(os.getenv("WEATHER_LON", "126.7052")), ge=-180, le=180), icao: str = Query(os.getenv("WEATHER_ICAO", "RKSI")), force_refresh: bool = False) -> dict[str, Any]:
    return await weather.get_current(lat, lon, icao, force_refresh)


@app.get("/api/weather/health")
async def weather_health() -> dict[str, Any]:
    return {"ok": True, "kma_service_key_configured": bool(os.getenv("KMA_SERVICE_KEY")), "cache_seconds": weather.cache_seconds}


@app.get("/api/airspace/layers")
async def airspace_layers() -> dict[str, Any]:
    return {"ok": True, "layers": AIRSPACE_LAYERS, "vworld_api_key_configured": bool(os.getenv("VWORLD_API_KEY"))}


@app.get("/api/airspace/geojson")
async def airspace_geojson(min_lon: float, min_lat: float, max_lon: float, max_lat: float, layers: str = "prohibited,restricted,control") -> dict[str, Any]:
    selected = [x.strip() for x in layers.split(",") if x.strip() in AIRSPACE_LAYERS]
    api_key = os.getenv("VWORLD_API_KEY", "")
    if not api_key:
        return {"type": "FeatureCollection", "features": [], "meta": {"layers": selected, "sources": [{"name": "VWorld", "ok": False, "message": "VWORLD_API_KEY 미설정"}]}}
    domain = os.getenv("VWORLD_DOMAIN", "localhost")
    features, sources = [], []
    async with httpx.AsyncClient(timeout=10, trust_env=False, headers={"User-Agent": "FireDroneGCS/2.0"}) as client:
        for layer in selected:
            meta = AIRSPACE_LAYERS[layer]
            try:
                response = await client.get("https://api.vworld.kr/req/data", params={"service": "data", "version": "2.0", "request": "GetFeature", "format": "json", "size": 1000, "page": 1, "geometry": "true", "attribute": "true", "crs": "EPSG:4326", "geomFilter": f"BOX({min_lon},{min_lat},{max_lon},{max_lat})", "data": meta["data"], "key": api_key, "domain": domain})
                response.raise_for_status()
                payload = response.json().get("response", {})
                if payload.get("status") not in (None, "OK", "NOT_FOUND"):
                    raise RuntimeError(payload.get("error", {}).get("text", "VWorld 응답 오류"))
                records = payload.get("result", {}).get("featureCollection", {}).get("features", [])
                for record in records:
                    record.setdefault("properties", {}).update({"_gcs_layer": layer, "_gcs_color": meta["color"], "_gcs_title": meta["title"]})
                features.extend(records)
                sources.append({"name": meta["title"], "ok": True, "message": f"{len(records)}건"})
            except Exception as exc:
                sources.append({"name": meta["title"], "ok": False, "message": str(exc)})
    return {"type": "FeatureCollection", "features": features, "meta": {"layers": selected, "sources": sources}}


@app.websocket("/ws/drone")
async def drone_socket(socket: WebSocket) -> None:
    await socket.accept()
    drone_sockets.add(socket)
    await socket.send_json({"type": "SYSTEM", "data": {"message": "관제 연결 완료. 실제 기체 연동 모듈은 이 WebSocket 명령을 수신하도록 연결하세요."}})
    try:
        while True:
            command = (await socket.receive_text()).strip()
            if command.startswith("CONNECT:"):
                await socket.send_json({"type": "STATUS", "data": {"mode": "CONNECTED", "endpoint": command.removeprefix("CONNECT:")}})
            elif command in {"ARM", "DISARM", "TAKEOFF", "LAND"}:
                await socket.send_json({"type": "COMMAND_ACK", "data": {"command": command, "accepted": True}})
            else:
                await socket.send_json({"type": "SYSTEM", "data": {"message": f"알 수 없는 명령: {command}"}})
    except WebSocketDisconnect:
        pass
    finally:
        drone_sockets.discard(socket)


@app.websocket("/ws/chat")
async def chat_socket(socket: WebSocket) -> None:
    await socket.accept()
    chat_sockets.add(socket)
    try:
        while True:
            message = await socket.receive_text()
            for peer in tuple(chat_sockets):
                try:
                    await peer.send_text(message)
                except RuntimeError:
                    chat_sockets.discard(peer)
    except WebSocketDisconnect:
        pass
    finally:
        chat_sockets.discard(socket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
