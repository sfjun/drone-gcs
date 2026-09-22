"""재사용 가능한 실시간 기상·항공기상 통합 모듈.

다른 프로그램에서도 파일 하나와 httpx만 복사해 다음처럼 사용한다.
    manager = WeatherManager(kma_service_key=os.getenv("KMA_SERVICE_KEY"))
    weather = await manager.get_current(37.4563, 126.7052, icao="RKSI")
"""
from __future__ import annotations

import asyncio
import math
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import httpx

KST = timezone(timedelta(hours=9))
OFFICIAL_PORTALS = {
    "kma_aviation": "https://global.amo.go.kr/",
    "kma_metar_taf": "https://global.amo.go.kr/control/metar-metreport.do?tab=2",
    "kma_airport_alerts": "https://global.amo.go.kr/forecast/alarm.do",
    "korea_aip": "https://aim.koca.go.kr/",
    "noaa_aviation_api": "https://aviationweather.gov/data/api/",
}


def knots_to_ms(value: float | int | None) -> float | None:
    return round(float(value) * 0.514444, 2) if value is not None else None


def inhg_to_hpa(value: float | int | None) -> float | None:
    return round(float(value) * 33.8639, 1) if value is not None else None


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def latlon_to_kma_grid(lat: float, lon: float) -> tuple[int, int]:
    """기상청 동네예보 격자(nx, ny) 변환."""
    re, grid, slat1, slat2, olon, olat, xo, yo = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    degrad = math.pi / 180.0
    slat1, slat2, olon, olat = slat1 * degrad, slat2 * degrad, olon * degrad, olat * degrad
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(math.tan(math.pi * .25 + slat2 * .5) / math.tan(math.pi * .25 + slat1 * .5))
    sf = math.tan(math.pi * .25 + slat1 * .5) ** sn * math.cos(slat1) / sn
    ro = re / grid * sf / math.tan(math.pi * .25 + olat * .5) ** sn
    ra = re / grid * sf / math.tan(math.pi * .25 + lat * degrad * .5) ** sn
    theta = (lon * degrad - olon) * sn
    return int(math.floor(ra * math.sin(theta) + xo + .5)), int(math.floor(ro - ra * math.cos(theta) + yo + .5))


class WeatherProvider(Protocol):
    name: str
    async def fetch(self, client: httpx.AsyncClient, lat: float, lon: float, icao: str | None) -> dict[str, Any]: ...


class OpenMeteoProvider:
    """API 키 없이 이용하는 좌표 기반 보조 관측 소스."""
    name = "Open-Meteo"

    async def fetch(self, client: httpx.AsyncClient, lat: float, lon: float, icao: str | None = None) -> dict[str, Any]:
        response = await client.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": lat, "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
            "wind_speed_unit": "ms", "timezone": "auto",
        })
        response.raise_for_status()
        current = response.json()["current"]
        return {"temperature": current.get("temperature_2m"), "humidity": current.get("relative_humidity_2m"),
                "pressure": current.get("surface_pressure"), "wind_speed": current.get("wind_speed_10m"),
                "wind_direction": current.get("wind_direction_10m"), "wind_gusts": current.get("wind_gusts_10m"),
                "observed_at": current.get("time"), "source": self.name}


class KmaUltraShortProvider:
    """기상청 초단기실황 API. data.go.kr 서비스키가 있을 때만 호출한다."""
    name = "기상청 초단기실황"

    def __init__(self, service_key: str | None) -> None:
        self.service_key = service_key

    async def fetch(self, client: httpx.AsyncClient, lat: float, lon: float, icao: str | None = None) -> dict[str, Any]:
        if not self.service_key:
            raise RuntimeError("KMA_SERVICE_KEY 미설정")
        base = datetime.now(KST) - timedelta(hours=1)  # 발표 지연을 고려한 직전 정시
        nx, ny = latlon_to_kma_grid(lat, lon)
        response = await client.get("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst", params={
            "serviceKey": self.service_key, "pageNo": 1, "numOfRows": 60, "dataType": "JSON",
            "base_date": base.strftime("%Y%m%d"), "base_time": base.strftime("%H00"), "nx": nx, "ny": ny})
        response.raise_for_status()
        body = response.json()["response"]["body"]
        if body.get("totalCount", 0) == 0:
            raise RuntimeError("기상청 관측값 미발표")
        items = {item["category"]: item["obsrValue"] for item in body["items"]["item"]}
        return {"temperature": _number(items.get("T1H")), "humidity": _number(items.get("REH")),
                "wind_speed": _number(items.get("WSD")), "wind_direction": _number(items.get("VEC")),
                "precipitation_mm": _number(items.get("RN1")), "observed_at": f"{base:%Y-%m-%d %H:00} KST",
                "source": self.name, "kma_grid": {"nx": nx, "ny": ny}}


class MetarProvider:
    """ICAO 공항 코드가 있을 때 METAR로 항공 운항 판단값을 보강한다."""
    name = "NOAA Aviation Weather METAR"

    async def fetch(self, client: httpx.AsyncClient, lat: float, lon: float, icao: str | None = None) -> dict[str, Any]:
        if not icao:
            raise RuntimeError("ICAO 공항 코드 미설정")
        response = await client.get("https://aviationweather.gov/api/data/metar", params={"ids": icao.upper(), "format": "json", "taf": "false", "hours": 2})
        response.raise_for_status()
        payload = response.json()
        report = payload[0] if isinstance(payload, list) and payload else payload
        if not isinstance(report, dict) or not report:
            raise RuntimeError(f"{icao.upper()} METAR 관측값 없음")
        visibility = _number(report.get("visib") or report.get("visibility"))
        return {"airport_icao": icao.upper(), "metar_raw": report.get("rawOb") or report.get("raw_text"),
                "temperature": _number(report.get("temp")), "dewpoint": _number(report.get("dewp")),
                "wind_speed": knots_to_ms(_number(report.get("wspd") or report.get("wind_speed_kt"))),
                "wind_direction": _number(report.get("wdir") or report.get("wind_dir_degrees")),
                "wind_gusts": knots_to_ms(_number(report.get("wgst") or report.get("wind_gust_kt"))),
                "pressure": inhg_to_hpa(_number(report.get("altim") or report.get("altim_in_hg"))),
                "visibility_km": visibility, "observed_at": report.get("obsTime") or report.get("observation_time"), "source": self.name}


class WeatherManager:
    """소스별 데이터를 합쳐 어디서든 쓸 수 있는 기상 상태를 반환한다."""
    def __init__(self, kma_service_key: str | None = None, cache_seconds: int = 60, timeout_seconds: float = 7) -> None:
        self.cache_seconds, self.timeout_seconds = cache_seconds, timeout_seconds
        self.providers: list[WeatherProvider] = [KmaUltraShortProvider(kma_service_key), MetarProvider(), OpenMeteoProvider()]
        self._cache: dict[tuple[float, float, str | None], tuple[float, dict[str, Any]]] = {}

    async def get_current(self, lat: float, lon: float, icao: str | None = None, force_refresh: bool = False) -> dict[str, Any]:
        key = (round(lat, 4), round(lon, 4), icao.upper() if icao else None)
        cached = self._cache.get(key)
        if cached and not force_refresh and time.monotonic() - cached[0] < self.cache_seconds:
            return {**cached[1], "cached": True}
        # 실행 PC의 잘못된 프록시 환경변수 때문에 관제 프로그램 전체가 멈추지 않게 한다.
        async with httpx.AsyncClient(timeout=self.timeout_seconds, headers={"User-Agent": "DroneGCS-WeatherManager/1.0"}, trust_env=False) as client:
            outcomes = await asyncio.gather(*(self._fetch(p, client, lat, lon, icao) for p in self.providers))
        successful = [item for item in outcomes if item["ok"]]
        data: dict[str, Any] = {"latitude": lat, "longitude": lon, "airport_icao": icao.upper() if icao else None,
                                "updated_at": datetime.now(KST).isoformat(), "cached": False,
                                "sources": [{k: item[k] for k in ("name", "ok", "message")} for item in outcomes],
                                "official_links": OFFICIAL_PORTALS.copy()}
        # 항공 METAR → 기상청 실황 → 좌표 기반 보조 관측 순서로 빈 값만 보충한다.
        for preferred in (self.providers[1].name, self.providers[0].name, self.providers[2].name):
            for item in successful:
                if item["name"] == preferred:
                    for field, value in item["data"].items():
                        if value is not None and data.get(field) is None:
                            data[field] = value
        data["risk"] = self._risk(data) if successful else {"level": "UNKNOWN", "action": "실시간 기상 데이터 수신 실패 — 공식 포털에서 재확인", "score": None}
        self._cache[key] = (time.monotonic(), data)
        return data

    async def _fetch(self, provider: WeatherProvider, client: httpx.AsyncClient, lat: float, lon: float, icao: str | None) -> dict[str, Any]:
        try:
            return {"name": provider.name, "ok": True, "message": "수신 완료", "data": await provider.fetch(client, lat, lon, icao)}
        except Exception as exc:
            return {"name": provider.name, "ok": False, "message": str(exc), "data": {}}

    @staticmethod
    def _risk(data: dict[str, Any]) -> dict[str, Any]:
        wind, gust, visibility = _number(data.get("wind_speed")) or 0, _number(data.get("wind_gusts")) or 0, _number(data.get("visibility_km")) or 10
        if gust >= 15 or wind >= 12 or visibility < 1:
            return {"level": "HIGH", "action": "이륙 금지 또는 즉시 복귀 검토", "score": min(100, int(max(wind, gust) * 6))}
        if gust >= 10 or wind >= 8 or visibility < 3:
            return {"level": "CAUTION", "action": "저고도·가시권 운용 및 현장 기상 재확인", "score": min(100, int(max(wind, gust) * 6))}
        return {"level": "NORMAL", "action": "기상 기준상 운용 가능 — 현장 판단 필수", "score": min(100, int(max(wind, gust) * 6))}
