# weather_api.py
# ============================================================
# WeatherManager <-> FastAPI 연결 Router
# ============================================================

import os

from fastapi import APIRouter, HTTPException, Query

from weather_manager import WeatherManager, OFFICIAL_PORTALS


# ------------------------------------------------------------
# 환경변수
# ------------------------------------------------------------

DEFAULT_LAT = float(
    os.getenv("WEATHER_LAT", "37.4563")
)

DEFAULT_LON = float(
    os.getenv("WEATHER_LON", "126.7052")
)

DEFAULT_ICAO = os.getenv(
    "WEATHER_ICAO",
    "RKSI"
)

CACHE_SECONDS = int(
    os.getenv("WEATHER_CACHE_SECONDS", "60")
)

TIMEOUT_SECONDS = float(
    os.getenv("WEATHER_TIMEOUT_SECONDS", "7")
)

KMA_SERVICE_KEY = os.getenv(
    "KMA_SERVICE_KEY"
)


# ------------------------------------------------------------
# WeatherManager
# main2.py에서:
#
# from weather_api import (
#     router as weather_router,
#     manager as weather_manager,
# )
#
# 로 가져간다.
# ------------------------------------------------------------

manager = WeatherManager(
    kma_service_key=KMA_SERVICE_KEY,
    cache_seconds=CACHE_SECONDS,
    timeout_seconds=TIMEOUT_SECONDS,
)


# ------------------------------------------------------------
# FastAPI Router
# ------------------------------------------------------------

router = APIRouter(
    prefix="/api/weather",
    tags=["weather"],
)


# ------------------------------------------------------------
# 현재 기상
# ------------------------------------------------------------

@router.get("/current")
async def get_current_weather(
    lat: float = Query(
        DEFAULT_LAT,
        ge=-90,
        le=90,
    ),

    lon: float = Query(
        DEFAULT_LON,
        ge=-180,
        le=180,
    ),

    icao: str | None = Query(
        DEFAULT_ICAO
    ),

    force_refresh: bool = Query(
        False
    ),
):

    try:

        clean_icao = (
            icao.strip().upper()
            if icao and icao.strip()
            else None
        )

        result = await manager.get_current(
            lat=lat,
            lon=lon,
            icao=clean_icao,
            force_refresh=force_refresh,
        )

        return result

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# ------------------------------------------------------------
# Weather API 상태
# ------------------------------------------------------------

@router.get("/health")
async def weather_health():

    return {

        "ok": True,

        "module": "weather_api",

        "manager":
            type(manager).__name__,

        "configuration": {

            "kma_service_key":
                bool(KMA_SERVICE_KEY),

            "default_lat":
                DEFAULT_LAT,

            "default_lon":
                DEFAULT_LON,

            "default_icao":
                DEFAULT_ICAO,

            "cache_seconds":
                CACHE_SECONDS,

            "timeout_seconds":
                TIMEOUT_SECONDS,
        },

        "providers": [
            provider.name
            for provider
            in manager.providers
        ],

        "official_portals":
            OFFICIAL_PORTALS,
    }