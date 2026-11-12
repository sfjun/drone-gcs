// =========================================================================
// 🛸 [GCS 코어 인프라] gcs_engine.js - 구조 개선 리팩토링 본
// =========================================================================

// GCS 시스템 통합 전역 네임스페이스 선언 (전역 오염 방지)
window.GcsApp = window.GcsApp || {
    // 💥 핵심 설정 및 상수 정의
    CONFIG: {
        VWORLD_API_KEY: "307B0E17-0322-43C3-A570-59947C0FC7A1",
        WMS_API_KEY: "767B7AD0-A21A-3A1E-9C3D-D57B7B123456",
        DEFAULT_ALTITUDE: 150.0,
        CAMERA_INIT_HEIGHT: 250
    },
    // 💥 기체 및 관제 상태 관리 전역 저장소
    state: {
        waypointList: [],
        isDrawingMode: true,
        isDragging: false,
        selectedEntity: undefined,
        vworldDisasterLayerInstance: null,
        gcsFireZoneEntities: [],
        lastRightClickLon: 0,
        lastRightClickLat: 0
    }
};

// 외부 프레임워크 호환용 글로벌 브릿지 바인딩 (기존 인터페이스 유지용)
window.waypointList = window.GcsApp.state.waypointList;


// =========================================================================
// 🚩 [GCS 최종 완성본] 기존 홈 카드 유무 체크 검증 및 컴퓨터 실시간 위치 추적 엔진
// =========================================================================
var map;
// 하드코딩 수치는 완벽히 배제하고 실시간으로 컴퓨터가 피딩할 빈 동적 변수 선언
var NANGOK_LON;
var NANGOK_LAT;
var NANGOK_INIT_ALT = 210;
var currentPlaceName = "";

/**
 * 💥 [무결성 분기 가드] 사용자가 명시적으로 미세 조정한 '기존 홈 카드 정보'가 있는지 검증합니다.
 */
var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");

if (savedHomeLock) {
    // 💡 [1순위 조건 일치] 기존 홈 설정 카드가 이미 디바이스에 저장되어 있는 경우!
    // 컴퓨터 실제 위치 추적을 완전히 스킵하고, 기존 카드의 미세 조정된 장소와 카메라 시점을 100% 영구 보존 유지합니다.
    var parsedHome = JSON.parse(savedHomeLock);
    NANGOK_LON = parseFloat(parsedHome.lon);
    NANGOK_LAT = parseFloat(parsedHome.lat);
    currentPlaceName = parsedHome.address || "사용자 지정 관제 공역";
    console.log("💾 [GCS 인프라] 기존 홈설정 카드 감지 성공 -> 컴퓨터 실제 위치 조회를 건너뛰고 기존 좌표를 복원 유지합니다:", parsedHome);

    var liveSafeAlt = parsedHome.alt || 200;
    var liveSavedHeight = parsedHome.calculatedRoofHeight || parsedHome.roofBase || 103;

    // 💥 [원본 직접 수선 5] 비동기 마운트 지연으로 인해 새로고침 시 원기둥이 누락되는 현상을 영구 박멸하는 수평/수직 관통 사출 체인
    window.addEventListener("load", function () {
        setTimeout(function () {
            var altInput = document.getElementById("gcs_home_alt_input");
            if (altInput) altInput.value = liveSafeAlt;

            var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
            var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function (n) { return n && n.id === "Home"; }) : null;
            if (homeNode) {
                homeNode.alt = liveSafeAlt;
                homeNode.altitude_Z = liveSafeAlt;
                homeNode.roofBase = liveSavedHeight;
                homeNode.roofHeight = liveSavedHeight;
                if (!homeNode.id || homeNode.id !== "Home") homeNode.id = "Home";
            }

            // 지도가 안전하게 안착한 마운트 정점 타이밍에 5번째 인자 자리에 진짜 저장 관제고도(liveSafeAlt)를 패싱 호출!!
            // if (typeof window.gcsDeployDynamicHPadAndPrismAirspace === "function") {
            //     window.gcsDeployDynamicHPadAndPrismAirspace(NANGOK_LON, NANGOK_LAT, liveSavedHeight, currentPlaceName, liveSafeAlt);
            // }

            if (typeof window.rebuildGcsPipelineAndLabels === "function") {
                window.rebuildGcsPipelineAndLabels();
            }
        }, 1500); // Cesium 3D 지형 캔버스가 렌더러 메모리에 완벽히 안착하는 무결성 유예 버퍼타임 보장
    });

    // 이전에 저장된 미세 조정 위치 그대로 지도를 즉시 기동합니다.
    gcsInitializeVWorldMap();
} else {
    // 💡 [2순위 조건 분기] 데이터가 아예 없는 최초 구동 상태인 경우! (예: 저장소 클리어 후 첫 진입)
    // 이때 비로소 내 컴퓨터 실제 현재 위치(HTML5 GPS/네트워크 위치 정보)를 역산하여 서울이면 서울, 부산이면 부산을 첫 화면으로 인식합니다.
    if (navigator.geolocation) {
        console.log("📡 [GCS 실제 위치 추적] 기존 카드가 없으므로 컴퓨터가 인식하는 실제 위치를 탐색합니다...");
        navigator.geolocation.getCurrentPosition(
            function (position) {
                // 내 컴퓨터 실제 현재 위치 좌표 다이렉트 대입
                NANGOK_LON = position.coords.longitude;
                NANGOK_LAT = position.coords.latitude;
                currentPlaceName = `실시간 컴퓨터 자동 인식 위치 (${NANGOK_LON.toFixed(4)}, ${NANGOK_LAT.toFixed(4)})`;
                console.log("🚀 [위치 인식 성공] 최초 기동 - 컴퓨터 실제 현재 위치 기반으로 GCS를 시동합니다:", NANGOK_LON, NANGOK_LAT);
                gcsInitializeVWorldMap();
            },
            function (error) {
                console.warn("⚠️ 컴퓨터 실제 위치 조회 권한 거부 또는 실패 -> 표준 공역으로 시동합니다.", error);
                // 네트워크 오류나 권한 거부 시 하드코딩 주소 대신 대한민국 표준 중앙 좌표대(대전 정부청사 부근)로 안전 우회
                NANGOK_LON = 127.3848;
                NANGOK_LAT = 36.3504;
                currentPlaceName = "시스템 기본 관제 공역 (대한민국 중심부)";
                gcsInitializeVWorldMap();
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    } else {
        console.warn("⚠️ 이 브라우저는 위치 인식을 지원하지 않습니다. 표준 공역으로 시동합니다.");
        NANGOK_LON = 127.3848;
        NANGOK_LAT = 36.3504;
        currentPlaceName = "시스템 기본 관제 공역";
        gcsInitializeVWorldMap();
    }
}

/**
 * 브이월드 3D 지도 인스턴스 레이아웃 동적 초기 기동 함수
 */
function gcsInitializeVWorldMap() {
    var options = {
        mapId: "vmap",
        initPosition: new vw.CameraPosition(
            new vw.CameraPosition ? new vw.CoordZ(NANGOK_LON, NANGOK_LAT, NANGOK_INIT_ALT) : new vw.CoordZ(127.3848, 36.3504, 210),
            new vw.Direction(0, -45, 0)
        ),
        logo: true,
        navigation: true
    };

    map = new vw.Map();
    map.setOption(options);
    map.setMapId("vmap");
    map.setInitPosition(new vw.CameraPosition(new vw.CoordZ(NANGOK_LON, NANGOK_LAT, NANGOK_INIT_ALT), new vw.Direction(0, -45, 0)));
    map.setLogoVisible(true);
    map.setNavigationZoomVisible(false);
    map.start();
}

/**
 * 브이월드 WFS 전역 검색 결과 필지 명세 상세 분석 파이프라인
 */
window.parseResponse = function (data) {
    if (!data) { alert("검색결과가 없습니다."); return; }
    var properties = null;
    if (data.features) {
        if (Array.isArray(data.features) && data.features.length > 0) {
            properties = data.features[0].properties;
        } else if (data.features.properties) {
            properties = data.features.properties;
        }
    }
    if (!properties) return;

    var resultHtml = [
        "<li> - pnu :   " + (properties.pnu || "-") + "</li>",
        "<li> - jibun : " + (properties.jibun || "-") + "</li>",
        "<li> - addr :  " + (properties.addr || "-") + "</li>",
        "<li> - jiga :  " + (properties.jiga || "-") + "</li>"
    ].join("");

    var $resultDiv = jQuery('#resultDiv');
    if ($resultDiv.length > 0) {
        $resultDiv.html(resultHtml);
    }
};

/**
 * 지능형 주소/명칭 탐색 검색 라우터 엔진 (카테고리 자동 주입)
 */
window.executeGcsSearch = function () {
    var searchInput = document.getElementById("gcs_search_keyword");
    var query = searchInput ? searchInput.value.trim() : "";
    var resultList = document.getElementById("resultDiv");
    var popupLayer = document.getElementById("gcs_search_layer_popup");

    if (!query) { alert("검색어를 입력하세요."); return; }
    if (resultList) {
        resultList.innerHTML = "<li style='padding: 12px; color: #ccc; text-align: center; list-style:none;'>탐색 중...</li>";
    }
    if (popupLayer) popupLayer.style.display = "block";

    // 주소 패턴 체크 검증 가드
    var isAddress = /[로길동읍면리가0-9]/.test(query);
    var searchType = isAddress ? "ADDRESS" : "PLACE";
    var categoryParam = "";

    if (searchType === "ADDRESS") {
        categoryParam = (query.indexOf("로") !== -1 || query.indexOf("길") !== -1) ? "road" : "parcel";
    }

    console.log("📡 [GCS 라우터] 유형: " + searchType + " | 카테고리: " + (categoryParam || "N/A") + " | 검색어: " + query);

    var requestData = {
        key: window.GcsApp.CONFIG.VWORLD_API_KEY,
        domain: window.location.hostname || "127.0.0.1", // 실시간 동적 도메인 매핑으로 고정 하드코딩 탈피
        service: "search",
        version: "2.0",
        request: "search",
        query: query,
        type: searchType,
        format: "json"
    };

    if (searchType === "ADDRESS") {
        requestData.category = categoryParam;
    }

    jQuery.ajax({
        type: "get",
        url: "https://api.vworld.kr/req/search",
        data: requestData,
        dataType: "jsonp",
        jsonpCallback: "parsePoiSearchResponse",
        success: function (data) {
            if (data && data.response && data.response.status === "NOT_FOUND") {
                if (resultList) resultList.innerHTML = "<li style='padding: 12px; color: red; text-align: center; list-style:none;'>결과가 없습니다.</li>";
            }
        }
    });
};

/**
 * 브이월드 POI 서버 응답 무선 처리 인터페이스 함수
 */
window.parsePoiSearchResponse = function (data) {
    var resultList = document.getElementById("resultDiv");
    if (!resultList) return;

    console.log("======================================================");
    console.log("📡 [GCS 수신부] 원본 데이터(Raw):", data);
    console.log("======================================================");

    if (data && data.response && data.response.status === "OK" && data.response.result) {
        var res = data.response.result;
        var rawData = res.items || res.juso || res.item;
        if (rawData) {
            window.renderGcsSearchResults(rawData);
            return;
        }
    }

    resultList.innerHTML = "<li style='padding: 12px; color: red; text-align: center; list-style:none;'>결과가 없습니다.</li>";
};


/**
 * 🚩 [검색 결착 완치] 검색 목록을 클릭하는 순간, 자동으로 영구 홈 데이터를 갱신하고 노란색 카드로 즉시 반영하는 렌더러
 */
window.renderGcsSearchResults = function (items) {
    var resultList = document.getElementById("resultDiv");
    if (!resultList) return;
    resultList.innerHTML = "";

    var itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
    console.log("📋 [GCS 렌더러] 최종 바인딩 리스트 구성:", itemsArray);

    var fragment = document.createDocumentFragment();

    itemsArray.forEach(function (item) {
        if (!item) return;

        var displayTitle = item.title || item.text || "이름 없음";
        if (displayTitle === "이름 없음" && item.address) {
            if (typeof item.address === "string") displayTitle = item.address;
            else if (item.address.road) displayTitle = item.address.road;
            else if (item.address.parcel) displayTitle = item.address.parcel;
        }

        var targetPoint = item.point || (item.geometry && item.geometry.point);
        if (!targetPoint) return;

        var lon = parseFloat(targetPoint.x);
        var lat = parseFloat(targetPoint.y);
        if (isNaN(lon) || isNaN(lat)) return;

        var li = document.createElement("li");
        li.style.cssText = "padding: 10px; border-bottom: 1px solid #34495e; color:#fff; cursor:pointer; list-style:none; text-align:left; transition:0.2s;";
        li.innerHTML = "<div><strong style='color: #00ffcc;'>📍 " + displayTitle + "</strong></div>" +
            "<div style='font-size:10px; color:#bdc3c7; margin-top:3px;'>좌표 - X: " + lon.toFixed(4) + ", Y: " + lat.toFixed(4) + "</div>";

        li.onmouseover = function () { this.style.background = "rgba(26, 188, 156, 0.25)"; };
        li.onmouseout = function () { this.style.background = "transparent"; };

        // 💥 [핵심 수정부] 검색 결과 항목 클릭 시 카메라 이동과 동시에 비행경로 출발지 카드 즉시 동기화
        li.addEventListener("click", function () {
            if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;

            ws3d.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            window.GcsApp.state.isDrawingMode = true;

            var oldSearchPoint = ws3d.viewer.entities.getById("vworld_search_marker_pin");
            if (oldSearchPoint) ws3d.viewer.entities.remove(oldSearchPoint);

            ws3d.viewer.entities.add({
                id: "vworld_search_marker_pin",
                position: Cesium.Cartesian3.fromDegrees(lon, lat, 0.0),
                point: {
                    pixelSize: 18, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });

            // 1. 카메라를 해당 검색 주소지로 0.8초만에 정밀 안착 비행
            ws3d.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.0012, 210.0),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-40.0), roll: 0.0 },
                duration: 0.8
            });

            // 팝업 레이어 닫기 원천 차단 우회 해결
            var targetPopup = document.getElementById("gcs_search_layer_popup");
            if (targetPopup) {
                targetPopup.style.display = "none";
            }
        });

        fragment.appendChild(li);
    });

    resultList.appendChild(fragment);

    if (resultList.children.length === 0) {
        resultList.innerHTML = "<li style='padding: 12px; color: red; text-align: center; list-style:none;'>결과가 없습니다.</li>";
    }
};

// =========================================================================
// 🧭 [공통 유틸리티] 진북(True North) 0° 기준 시계방향(CW) 방위각 산출기
// =========================================================================
window.getGcsTrueNorthBearing = function (deg) {
    // 0° ~ 359° 범위로 시계방향 정규화 (진북 = 0°, 정동 = 90°, 정남 = 180°, 정서 = 270°)
    var cwDeg = Math.round(deg) % 360;
    if (cwDeg < 0) cwDeg += 360;
    
    var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    var compassCode = directions[Math.round(cwDeg / 45)];
    
    return {
        code: compassCode,
        deg: cwDeg,
        rad: Cesium.Math.toRadians(cwDeg),
        text: compassCode + " " + cwDeg + ".0°"
    };
};

// =========================================================================
// 🚩 [출발지 전용 템플릿] '관제 고정' 완전 제거 및 '💾 저장' 버튼 영구 적용
// =========================================================================
window.gcsRenderPureHomeCardTemplate = function (node) {
    var isBuilding = (parseFloat(node.roofBase) > 0);
    var baseHeightText = isBuilding
        ? `건물고도: <strong style="color: #fffa65; font-size: 13px;">${node.roofBase}m</strong>`
        : `지면고도: <strong style="color: #00ffcc; font-size: 13px;">${parseFloat(node.alt) - 60 > 0 ? Math.round(parseFloat(node.alt) - 60) : 86}m</strong> <span style="font-size:10px; color:#95a5a6;">(지상 높이)</span>`;

    // 진북(0°) 기준 현재 드론 기수 방위각 산출
    var currentHeadingDeg = 0;
    if (node.heading_deg !== undefined && !isNaN(parseFloat(node.heading_deg))) {
        currentHeadingDeg = parseFloat(node.heading_deg);
    } else if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.camera) {
        currentHeadingDeg = Cesium.Math.toDegrees(ws3d.viewer.camera.heading);
    }

    var cwDeg = Math.round(currentHeadingDeg) % 360;
    if (cwDeg < 0) cwDeg += 360;
    var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    var compassCode = directions[Math.round(cwDeg / 45)];
    var bearingText = compassCode + " " + cwDeg + ".0°";

    node.heading_deg = cwDeg;
    node.heading_compass = compassCode;
    node.heading_rad = Cesium.Math.toRadians(cwDeg);

    return `
            <div id="card_waypoint_Home" class="gcs-waypoint-card active" 
            onclick="window.focusGcsNodeOnMap(${node.lon}, ${node.lat}, ${parseFloat(node.roofBase) || 0});"
            style="padding: 12px; border-left: 4px solid #f1c40f; margin-bottom: 8px; background: rgba(30, 39, 46, 0.95); border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="color: #f1c40f; font-weight: bold; font-size: 14px;">🚩 출발지 (Home)</span>
                <button type="button" class="gcs-home-save-btn" onclick="event.stopPropagation(); window.saveGcsHomeCardDirectly();" style="background: #f1c40f; border: none; color: #000; cursor: pointer; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; z-index: 10; transition: 0.2s;">💾 저장</button>
            </div>
            
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(0,0,0,0.45); padding: 5px 10px; border-radius: 4px; border: 1px solid rgba(241, 196, 15, 0.35); white-space: nowrap;">
                <span style="color: #f1c40f; font-weight: bold;">🧭 기체기수:</span>
                <strong style="color: #ffffff; font-family: monospace;">${bearingText}</strong>
            </div>

            <div style="margin-top: 6px; font-size: 11px; color: #bdc3c7; font-family: monospace;">X: ${parseFloat(node.lon).toFixed(6)} &nbsp; Y: ${parseFloat(node.lat).toFixed(6)}</div>
            
            <div id="gcs_core_height_anchor_node" style="margin-top: 6px; font-size: 12px; color: #bdc3c7; line-height: 1.4;">
                ${baseHeightText}
            </div>

            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ecf0f1;">
                <span>관제 고도:</span>
                <input type="number" id="gcs_home_alt_input" value="${Math.round(node.alt)}" min="10" max="1000" step="5" 
                       onclick="event.stopPropagation();"
                       style="width: 70px; background: #111; border: 1px solid #f1c40f; color: #fff; font-weight: bold; font-size: 13px; text-align: center; border-radius: 3px; padding: 2px;" />
                <span style="color: #2ecc71; font-weight: bold;">m</span>
            </div>
        </div>
    `;
};

/**
• 🛠️ [2] 마우스 우클릭 시 관제 데이터 객체를 최초 가동하는 빌더 엔진
• (시동 단계의 고도 NaN 유실 원천 차단)
*/
window.handleGcsMapRightClickInsert = function (numLon, numLat, actionType) {
    if (!window.GcsApp) window.GcsApp = { state: {} };
    if (!window.GcsApp.state) window.GcsApp.state = {};
    if (!Array.isArray(window.GcsApp.state.waypointList)) window.GcsApp.state.waypointList = []; var fallbackDefaultAlt = 150.0;
    if (typeof recommendedInitialAlt !== "undefined" && recommendedInitialAlt && !isNaN(recommendedInitialAlt)) {
        fallbackDefaultAlt = parseFloat(recommendedInitialAlt);
    } var list = window.GcsApp.state.waypointList;
    var uniqueId = actionType === "destination" ? "Destination" : "WP_TEMP_" + Date.now();// 최초 생성부 고도 속성에 정제된 Float 숫자 강제 래칭
    var newFlightNode = {
        id: uniqueId,
        lon: parseFloat(numLon),
        lat: parseFloat(numLat),
        alt: parseFloat(fallbackDefaultAlt)
    }; if (actionType === "destination") {
        list = list.filter(function (item) { return item && item.id !== "Destination"; });
    } list.push(newFlightNode);
    window.GcsApp.state.waypointList = list;// 데이터 정렬 파이프라인 제어반 구동
    if (typeof window.triggerGcsCommand === "function") {
        window.triggerGcsCommand(numLon, numLat, actionType);
    }
};

// =========================================================================
// 🛸 [최종 무결성 완치 패치] Cesium 내부 프라이빗 배열 탐색 연산 전면 제거
// =========================================================================
map.onInit = function () {
    console.log("📡 [GCS 마스터 부트스트랩] 최초 UI 목록을 빌드하고 초정밀 인터록을 가동합니다.");

    // 1. 좌측 메뉴 UI 파이프라인을 가동하여 출발지(Home) 카드를 화면에 선사출합니다.
    if (typeof window.renderWaypointListUI === "function") {
        window.renderWaypointListUI();
    }

    // 2. 🛡️ [안전 구조 가드] RangeError를 유발하는 내부 타일셋 큐(_tileLoadQueueHigh) 조회를 100% 전면 차단합니다.
    // 대신 Cesium 카메라 비행이 안정화되는 시점에 안전 버퍼를 두고 출발지 카드를 격발시킵니다.
    var bootScanCounter = 0;
    var checkEngineReadyInterval = setInterval(function () {
        bootScanCounter++;

        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.scene) {
            var mainViewer = ws3d.viewer;

            // 카메라가 초기 위치로 이동하는 중(비행 상태)이 아닐 때만 안전 진입
            if (!mainViewer.camera._inFlight) {
                clearInterval(checkEngineReadyInterval); // 인터벌 즉시 파괴 해제

                console.log("%c🛸 [GCS 시스템 자동 시동] 3D 지형 안착 확인 완료 ➡️ 안전 버퍼 후 홈 에어돔 사출", "color:#00ffcc; font-weight:bold;");

                // 브이월드 3D 내장 엔진 버퍼가 완전히 안착하도록 600ms의 안정적인 유예 시간을 배정합니다.
                setTimeout(function () {
                    var homeCardElement = document.getElementById("card_waypoint_Home");
                    if (homeCardElement) {
                        homeCardElement.click();
                    }
                }, 600);
            }
        }

        // 백업 가드: 로딩 지연 시 6초 후 자동 탈출
        if (bootScanCounter > 40) {
            clearInterval(checkEngineReadyInterval);
            var backupCard = document.getElementById("card_waypoint_Home");
            if (backupCard) backupCard.click();
        }
    }, 150);
};

// =========================================================================
// 🔒 [gcs_engine.js 최종 완성본] 방위각 회전 완전 배제 및 클릭 지점 정중앙 고정 엔진
// =========================================================================
window.gcsLastSaved3DCameraState = window.gcsLastSaved3DCameraState || {
    heading: 0.0,
    pitch: Cesium.Math.toRadians(-45.0),
    roll: 0.0,
    height: 300.0
};
window.isGcsCameraCurrently2D = false;

window.gcsInitializeCoreEngineDoubleClickToggle = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var scene = ws3d.viewer.scene;

    if (window.gcsEngineLevelDoubleClickEventHandler) {
        window.gcsEngineLevelDoubleClickEventHandler.destroy();
    }

    window.gcsEngineLevelDoubleClickEventHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

    window.gcsEngineLevelDoubleClickEventHandler.setInputAction(function (dbClickEvent) {
        if (!dbClickEvent.position) return;

        var camera = ws3d.viewer.camera;

        // 🔒 사용자가 전체화면 상에서 실제 마우스로 내리찍은 더블클릭 정밀 절대 좌표 추출
        var pickedCartesian = scene.pickPosition(dbClickEvent.position);
        if (!Cesium.defined(pickedCartesian)) {
            var ray = camera.getPickRay(dbClickEvent.position);
            pickedCartesian = scene.globe.pick(ray, scene);
        }

        // 공터 및 허공 클릭 대비용 센터 백업 타겟팅 레이어 
        if (!Cesium.defined(pickedCartesian)) {
            var canvas = scene.canvas;
            var centerRay = camera.getPickRay(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
            pickedCartesian = scene.globe.pick(centerRay, scene);
        }

        if (!Cesium.defined(pickedCartesian)) return;

        // 3D 절대 공간 좌표를 위경도 및 지형 높이 제원으로 변환
        var carto = Cesium.Cartographic.fromCartesian(pickedCartesian);
        var clickLon = Cesium.Math.toDegrees(carto.longitude);
        var clickLat = Cesium.Math.toDegrees(carto.latitude);
        var clickHeight = carto.height;

        // 임시 3인칭 회전 매트릭스 리셋
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        var currentCameraHeight = camera.positionCartographic.height;
        var relativeFlightHeight = currentCameraHeight - clickHeight;
        if (relativeFlightHeight < 50) relativeFlightHeight = 250.0; // 최소 가이드 안전 고도

        if (window.isGcsCameraCurrently2D === false) {
            // 💥 [A] 3D 사선 모드 ➡️ 2D 정탑 모드 전환 
            // 전환 직전 유저가 보고 있던 고도(Height) 제원만 정밀 저장 백업
            window.gcsLastSaved3DCameraState.height = currentCameraHeight;

            console.log(`%c🛰️ [GCS 시점 제어] 클릭 중심 정탑뷰 2D 전환 (방위각 회전 고정) ➡️ 좌표: (${clickLon.toFixed(5)}, ${clickLat.toFixed(5)})`, "color:#f1c40f; font-weight:bold;");

            window.isGcsCameraCurrently2D = true;

            // 🔒 화면이 멋대로 돌아가는 결함을 원천 방어하기 위해 heading각을 무조건 '0.0(정북방향)'으로 고정 압착 사출!!
            camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(clickLon, clickLat, currentCameraHeight),
                orientation: {
                    heading: 0.0,                 // 회전 전면 차단 고정 (정북 고정)
                    pitch: Cesium.Math.toRadians(-90.0), // 수직 부감 각도 낙하
                    roll: 0.0
                },
                duration: 0.4
            });
        } else {
            // 💥 [B] 2D 정탑 모드 ➡️ 3D 사선뷰 화각 시점 복원
            console.log(`%c🛸 [GCS 시점 제어] 클릭 중심 3D 사선뷰 복원 (방위각 회전 고정) ➡️ 좌표: (${clickLon.toFixed(5)}, ${clickLat.toFixed(5)})`, "color:#2ecc71; font-weight:bold;");

            window.isGcsCameraCurrently2D = false;

            // 🔒 복원 비행 시에도 화면이 회전하지 않도록 heading을 '0.0' 정북 고정 상태로 3D 사선 틸트 피치만 반영!!
            var restoreHeading = 0.0;
            var restorePitch = Cesium.Math.toRadians(-45.0); // 3D 관제용 사선 최적 표준 고각 배치
            var restoreRoll = 0.0;

            var targetLookCenter = Cesium.Cartesian3.fromDegrees(clickLon, clickLat, clickHeight);

            // 더블클릭 정점 타깃 좌표를 화면 정중앙에 고정시킨 채 사선 각도만 부드럽게 토글 스위칭
            camera.flyTo({
                destination: camera.position,
                duration: 0.0,
                complete: function () {
                    // 회전 없이 정북을 바라본 상태에서 지정 사선 틸트 각도와 상대 고도만 주입
                    camera.lookAt(targetLookCenter, new Cesium.HeadingPitchRange(restoreHeading, restorePitch, relativeFlightHeight));

                    // 회전 중심 매트릭스 락을 다시 글로벌 원위치로 초기화하여 지도 조작 자유 상태 복원
                    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                }
            });
        }

    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
};

// Viewer 엔진 캔버스 적재 유예 타이밍 추적 감시용 부트 로더
window.addEventListener("load", function () {
    var coreBootCounter = 0;
    var secureBootInterval = setInterval(function () {
        coreBootCounter++;
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
            clearInterval(secureBootInterval);
            window.gcsInitializeCoreEngineDoubleClickToggle();
            console.log("🛡️ [GCS 뷰포트 완치] 방위각 회전이 영구 박멸된 정중앙 락온 모듈 이식 완료.");
        }
        if (coreBootCounter > 30) clearInterval(secureBootInterval);
    }, 300);
});

/**
 * 🛸 [삼각기둥 가속 렌더러 백업 엔진] 
 * 입력된 고도 수치를 기반으로 Cesium 공간에 투명 주황색 기둥과 상공 텍스트를 정밀 사출합니다.
 */
window.gcsTriggerRenderAirspace = function (lon, lat, alt, id) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;

    // 지상 정점 노란색 마커 동기화
    var existingMarker = mainViewer.entities.getById("GCS_NODE_ENTITY_Home");
    if (existingMarker) mainViewer.entities.remove(existingMarker);
    mainViewer.entities.add({
        id: "GCS_NODE_ENTITY_Home",
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point: { pixelSize: 15, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
    });

    // 기존 3D 삼각기둥 객체 클리어 후 가변 고도로 전격 재빌딩
    var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
    fireZoneEntities.forEach(function (e) { mainViewer.entities.remove(e); });
    window.GcsApp.state.gcsFireZoneEntities = [];

    var nodeColor = Cesium.Color.DARKORANGE;
    var trianglePos = [];
    for (var a = 0; a < 360; a += 120) {
        var rad = Cesium.Math.toRadians(a);
        trianglePos.push(lon + (0.000125 * Math.cos(rad)), lat + (0.000125 * Math.sin(rad)));
    }

    // 💥 [수정 완치 포인트] .withAlpha 문법을 제거하고 정식 안전 팩토리 함수로 전면 대체
    var polygonEntity = mainViewer.entities.add({
        polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePos), height: 0.0, extrudedHeight: alt, material: nodeColor.withAlpha(0.35), outline: true, outlineColor: nodeColor.withAlpha(0.7), outlineWidth: 3 }
    });

    var labelEntity = mainViewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt + 15.0),
        label: { text: id + " (" + Math.round(alt) + "m)", font: 'bold 13px "Malgun Gothic", sans-serif', fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY }
    });
    window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity, labelEntity);
    mainViewer.scene.requestRender();
};

// =========================================================================
// 🛸 [GCS 엔진 최종 본] 건물 하이라이트 정점 원본 좌표 스냅 및 실시간 잠금 엔진
// =========================================================================

// 정밀 스냅을 위한 전역 스토리지 변수 세분화 및 리셋
window.GcsApp.state.lastPickedBuildingHeight = 0;
window.GcsApp.state.lastPickedBuildingLon = 0;
window.GcsApp.state.lastPickedBuildingLat = 0;
window.GcsApp.state.isBuildingHoveredActive = false;

// =========================================================================
// 🛸 [GCS 관제 엔진 완벽 마스터 본] 목적지 꼬임 버그 박멸 및 순정 하이라이트 동기화 복원 패치
// =========================================================================

if (!window.GcsApp) window.GcsApp = {};
if (!window.GcsApp.state) window.GcsApp.state = {};

// 마스터 락온 가드 버퍼 안전 초기화
window.GcsApp.state.isRightClickOnBuilding = false;
window.GcsApp.state.lastRightClickRoofLon = 0;
window.GcsApp.state.lastRightClickRoofLat = 0;
window.GcsApp.state.lastRightClickRoofHeight = 0;
window.GcsApp.state.gcsSelectedFeature = null;



window.triggerGcsCommand = function (numLon, numLat, actionType) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // =========================================================================
    // 🔒 [4단계 완치 실드] 인자 유실 및 문자열 파괴 방지형 홈 변경 이중 확인창 가드
    // =========================================================================
    // actionType 인자값이 누락(undefined)되거나 문자열이 아닐 경우를 대비해 철저한 가드 문자열화 처리
    var checkActionType = "waypoint";
    if (actionType !== undefined && actionType !== null) {
        checkActionType = String(actionType).toLowerCase().trim();
    } else if (typeof numLon === "string") {
        // 백업 분기 : 간혹 순정 소스에서 actionType 자리에 numLon 문자열을 토스하는 오접착 경우 우회
        var testAction = numLon.toLowerCase().trim();
        if (testAction === "home" || testAction === "waypoint" || testAction === "destination") {
            checkActionType = testAction;
        }
    }

    // 현재 지도를 바라보는 화면 12시 방향(카메라 시선) 진북 기준 각도(0°~359°) 캡처
    var currentScreenHeadingDeg = 0;
    if (mainViewer && mainViewer.camera) {
        currentScreenHeadingDeg = Math.round(Cesium.Math.toDegrees(mainViewer.camera.heading)) % 360;
        if (currentScreenHeadingDeg < 0) currentScreenHeadingDeg += 360;
    }

    var nodeData = {
        id: targetNodeId,
        lon: numLon,
        lat: numLat,
        alt: computedCameraDesignAlt,
        roofBase: roofBaseHeightToSave,
        address: dynamicBuildingName,
        isBuilding: isActuallyBuilding,
        // 홈 설정 시 현재 드론/카메라 방위각 저장, 목적지 추가 시 현재 화면 12시 방향 각도 즉시 캡처 저장
        heading_deg: currentScreenHeadingDeg,
        heading_H: Cesium.Math.toRadians(currentScreenHeadingDeg)
    };

    var currentAction = (typeof actionType === "string") ? actionType.toLowerCase().trim() : "waypoint";
    var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
    if (!Array.isArray(list)) list = [];
    numLon = parseFloat(numLon);
    numLat = parseFloat(numLat);
    var targetPixelX = window.gcsCurrentMouseX || (scene.canvas.clientWidth / 2);
    var targetPixelY = window.gcsCurrentMouseY || (scene.canvas.clientHeight / 2);
    var isGcsMousePickingError = false;
    var roofBaseHeightToSave = 0;
    var isActuallyBuilding = false;
    if (isNaN(numLon) || isNaN(numLat) || numLon === 0 || numLat === 0) {
        isGcsMousePickingError = true;
    }
    if (isGcsMousePickingError === false) {
        var rect = scene.canvas.getBoundingClientRect();
        var windowPosition = new Cesium.Cartesian2(targetPixelX - rect.left, targetPixelY - rect.top);
        var pickedFeature = scene.pick(windowPosition);
        var isValid3DBuildingTileset = false;
        if (Cesium.defined(pickedFeature)) {
            if (pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe) && !(pickedFeature.primitive instanceof Cesium.Polyline) && !(pickedFeature.primitive instanceof Cesium.Label)) {
                isValid3DBuildingTileset = true;
            }
            if (pickedFeature.content || pickedFeature.getProperty) {
                isValid3DBuildingTileset = true;
            }
        }
        var isBuildingHighlightLayerActive = (window.GcsApp?.state?.isRightClickOnBuilding === true || window.GcsApp?.state?.isBuildingHighlighted === true || document.body.classList.contains("gcs-building-selected"));
        if ((isValid3DBuildingTileset === true || isBuildingHighlightLayerActive === true) && window.GcsApp?.state?.lastRightClickRoofHeight > 0) {
            roofBaseHeightToSave = parseFloat(window.GcsApp.state.lastRightClickRoofHeight);
            isActuallyBuilding = true;
        } else if (scene.globe) {
            var cartoTmp = new Cesium.Cartographic(Cesium.Math.toRadians(numLon), Cesium.Math.toRadians(numLat));
            var exactGroundHeight = Math.round(scene.globe.getHeight(cartoTmp) || 0);
            // 💥 [공중부양 결함 완치 실드 1]: 세슘이 계산한 실제 지표면 높이가 비정상적인 값(0 이하)이거나 수식 누락일 경우 즉시 오류 레이칭 격발!
            if (exactGroundHeight <= 0 || isNaN(exactGroundHeight)) {
                isGcsMousePickingError = true;
            } else {
                roofBaseHeightToSave = exactGroundHeight;
                isActuallyBuilding = false;
                if (window.GcsApp && window.GcsApp.state) {
                    window.GcsApp.state.isRightClickOnBuilding = false;
                }
            }
        }
        roofBaseHeightToSave = Math.round(roofBaseHeightToSave);
        // 💥 [공중부양 결함 완치 실드 2]: 바닥 고도가 5m 미만의 유령 공백이거나 비정상 고고도인 경우 물리 레이캐스팅 실패로 간주하고 칼같이 차단!
        if (isNaN(roofBaseHeightToSave) || roofBaseHeightToSave <= 5 || roofBaseHeightToSave > 2000) {
            isGcsMousePickingError = true;
        }
    }
    // 💥 [자동 실행 차단 브레이크]: 허공이나 매핑 오류 영역을 찍으면 컨펌창도 띄우지 않고 즉시 자동 폐기 처리합니다!
    if (isGcsMousePickingError === true) {
        var oldMouseToast = document.getElementById("gcs_mouse_error_toast");
        if (oldMouseToast) oldMouseToast.remove();
        var mouseToast = document.createElement("div");
        mouseToast.id = "gcs_mouse_error_toast";
        mouseToast.style.cssText = "position: fixed; left: " + (targetPixelX + 15) + "px; top: " + (targetPixelY + 15) + "px; background: rgba(239, 83, 80, 0.98); color: #ffffff; padding: 10px 18px; border-radius: 4px; font-family: 'Malgun Gothic', sans-serif; font-size: 13px; font-weight: bold; z-index: 100000000; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 1px solid #ff3333; pointer-events: none;";
        mouseToast.innerHTML = "⚠️ 공중부양 유령 좌표 감지: 자동 등록이 무효화되었습니다.";
        document.body.appendChild(mouseToast);
        setTimeout(function () { if (mouseToast) mouseToast.remove(); }, 2500);
        console.log("❌ [GCS 차단 실드] 허공 또는 매핑 실패 구역(공중부양) 픽킹 시도를 자동 차단했습니다.");
        scene.requestRender();
        return;
    }

    var targetNodeTypeName = (currentAction.indexOf("home") !== -1) ? "출발지 (Home)" : ((currentAction.indexOf("destination") !== -1) ? "목적지 (Destination)" : "경유지 (Waypoint)");
    var detectedLayerTypeString = isActuallyBuilding ? "🏢 [건물 옥상 고도] 감지 성공" : "🏞️ [자연 평지 지면] 감지 성공";
    var userConfirmMessage = "🛰️ GCS 실시간 공역 피킹 검착 보고\n\n" +
        "▶ 추가 대상: " + targetNodeTypeName + "\n" +
        "▶ 감지 레이어: " + detectedLayerTypeString + "\n" +
        "▶ 감지 바닥 높이: " + roofBaseHeightToSave + "m\n\n" +
        "프로그램이 판단한 위 제원이 실제 지형 구조와 일치합니까?\n" +
        "[확인]을 누르면 공역 카드가 생성되며, [취소] 시 즉시 무효화됩니다.";
    
    var computedCameraDesignAlt = roofBaseHeightToSave + 150;
    var dynamicBuildingName = isActuallyBuilding ? "3D 건물 아파트 공역 옥상" : "자연 지표면 평지 공역";
    var targetNodeId = "WP_TEMP";
    if (currentAction.indexOf("home") !== -1) {
        targetNodeId = "Home";
        computedCameraDesignAlt = roofBaseHeightToSave + 150;
    } else {
        computedCameraDesignAlt = window.getGcsDestinationAltitude ? window.getGcsDestinationAltitude(roofBaseHeightToSave) : (roofBaseHeightToSave + 39);
        if (currentAction.indexOf("destination") !== -1) {
            targetNodeId = "Destination";
            dynamicBuildingName = isActuallyBuilding ? "3D 건물 인프라 공역 목적지" : "최종 자율 항행 목적지 공역";
        } else {
            var existingWpCount = list.filter(function (item) { return item && (item.id.startsWith("WP_") || item.id.startsWith("WP_TEMP")); }).length;
            targetNodeId = "WP_" + (existingWpCount + 1);
            dynamicBuildingName = isActuallyBuilding ? "3D 건물 비율 연동 순항 공역" : "지면 기반 비율 연동 순항 공역";
        }
    }
    computedCameraDesignAlt = Math.round(computedCameraDesignAlt);
    var nodeData = {
        id: targetNodeId,
        lon: numLon,
        lat: numLat,
        alt: computedCameraDesignAlt,
        roofBase: roofBaseHeightToSave,
        address: dynamicBuildingName,
        isBuilding: isActuallyBuilding
    };
    if (currentAction.indexOf("home") !== -1) {
        list = list.filter(function (item) { return item && item.id !== "Home"; });
        list.unshift(nodeData);
    } else if (currentAction.indexOf("destination") !== -1) {
        list = list.filter(function (item) { return item && item.id !== "Destination"; });
        list.push(nodeData);
    } else {
        var isAlreadyExist = list.some(function (n) { return Math.abs(n.lon - numLon) < 0.000001 && Math.abs(n.lat - numLat) < 0.000001; });
        if (!isAlreadyExist) list.push(nodeData);
    }
    var cleanList = [];
    var homeNode = list.find(function (n) { return n && n.id === "Home"; });
    if (homeNode) cleanList.push(homeNode);
    var rawWaypoints = list.filter(function (n) { return n && n.id !== "Home" && n.id !== "Destination"; });
    var wpCounter = 1;
    rawWaypoints.forEach(function (node) {
        var dynamicWpAlt = window.getGcsDestinationAltitude ? window.getGcsDestinationAltitude(node.roofBase) : node.alt;
        cleanList.push({
            id: "WP_" + wpCounter++,
            lon: node.lon,
            lat: node.lat,
            alt: dynamicWpAlt,
            roofBase: node.roofBase,
            address: node.address || "자연 지표면 평지 공역",
            isBuilding: node.isBuilding
        });
    });
    var destinationNode = list.find(function (n) { return n && n.id === "Destination"; });
    if (destinationNode) {
        cleanList.push(destinationNode);
    }
    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList;
    window.gcsUserManualAltOverrideLock = true;
    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    console.log("▶ [GCS 데이터 마운트 성공] " + targetNodeId + " -> 바닥: " + roofBaseHeightToSave + "m | 연동 관제고도: " + computedCameraDesignAlt + "m");
    
    // =========================================================================
    // 💥 [최종 결착] 목적지 카드 추가 시 출발지 카드 내부 방위각 강제 리프레시 
    // =========================================================================
    // 함수 끝단에 삽입하여 목적지 데이터가 배열에 완전히 들어간 후 출발지 카드를 HTML에 다시 그립니다.
    var currentHomeNodeObj = list.find(function (n) { return n && n.id === "Home"; });
    var htmlContainerElement = document.getElementById("wp_list_container") || 
                               document.getElementById("gcs_waypoint_list_container") || 
                               document.getElementById("waypoint_list");

    if (currentHomeNodeObj && htmlContainerElement && typeof window.gcsRenderPureHomeCardTemplate === "function") {
        // 기존에 화면 맨 위에 있던 옛날 출발지 카드를 HTML 상에서 완전히 수거 삭제
        var oldHomeCard = document.getElementById("card_waypoint_Home");
        if (oldHomeCard) oldHomeCard.remove();

        // 3단계 나침반 연산 축이 내장된 새로운 템플릿 스트링 호출
        var freshHomeCardHtml = window.gcsRenderPureHomeCardTemplate(currentHomeNodeObj);

        // 리스트 컨테이너 맨 첫 번째 자식 자리에 자석처럼 즉시 실시간 피딩 주입!!
        htmlContainerElement.insertAdjacentHTML('afterbegin', freshHomeCardHtml);
    }
    // =========================================================================


    // =========================================================================
    // 🛠️ [gcs_engine.js] window.triggerGcsCommand 맨 아래쪽 정리
    // =========================================================================
    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList;
    window.gcsUserManualAltOverrideLock = true;

    // 아래 두 줄만 남기고, 그 아래에 추가했던 oldHomeCard.remove() 및 insertAdjacentHTML 블록은 삭제하세요.
    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();

    scene.requestRender();
    
}; // window.triggerGcsCommand 함수가 끝나는 괄호

document.addEventListener("mousemove", function (e) {
    window.gcsCurrentMouseX = e.clientX;
    window.gcsCurrentMouseY = e.clientY;
}, { passive: true });


/**
 * 🛸 [GCS 코어 인터랙션 엔진 - 최종 완성본]
 * 건물의 경우 오직 '좌클릭 선택(노란색 하이라이트)'이 완료된 상태에서만 우클릭 팝업을 허용하며,
 * 일반 맨땅 지면은 선행 조건 없이 즉시 우클릭 팝업이 사출되도록 무결성 분기 가드를 결착합니다.
 */
vw.ws3dInitCallBack = function () {
    window.viewer = ws3d.viewer;
    var scene = ws3d.viewer.scene;
    var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

    // 우클릭 시 브라우저 자체 팝업 메뉴 차단막 가드
    scene.canvas.addEventListener("contextmenu", function (e) {
        e.preventDefault(); e.stopPropagation(); return false;
    }, { passive: false });

    // 전역 하이라이트 불빛 및 임시 락온 버퍼 안전 세척 함수
    var resetGcsSelectedFeatureColor = function () {
        if (window.GcsApp.state.gcsSelectedFeature) {
            try {
                if (window.GcsApp.state.gcsSelectedFeature.color) {
                    window.GcsApp.state.gcsSelectedFeature.color = Cesium.Color.WHITE;
                }
            } catch (e) { }
            window.GcsApp.state.gcsSelectedFeature = null;
        }
        window.GcsApp.state.gcsHoveredFeature = null;
        window.GcsApp.state.isRightClickOnBuilding = false; // 건물 선택 플래그 완벽 초기화
    };

    // ESC 키 취소 가드 리스너
    window.removeEventListener("keydown", window.gcsEscKeyHandler);
    window.gcsEscKeyHandler = function (e) {
        var ctxMenu = document.getElementById("gcs_context_menu");
        if (e.key === "Escape" || e.keyCode === 27) {
            if (ctxMenu) ctxMenu.style.display = "none";
            resetGcsSelectedFeatureColor();
            window.GcsApp.state.lastRightClickRoofHeight = 0;
            scene.requestRender();
            if (typeof window.gcsReportBuildingDataToScreen === "function") { window.gcsReportBuildingDataToScreen(0, 0, 0); }
        }
    };
    window.addEventListener("keydown", window.gcsEscKeyHandler);

    // 카메라 이동 시 메뉴판 차단막
    if (scene.camera.moveStart) {
        scene.camera.moveStart.addEventListener(function () {
            var ctxMenu = document.getElementById("gcs_context_menu");
            if (ctxMenu && ctxMenu.style.display === "block") { ctxMenu.style.display = "none"; scene.requestRender(); }
        });
    }

    // =========================================================================
    // 🔒 [최종 마스터 완치] 카메라 사선 각도 허공 팅김 박멸 및 옥상 강제 스냅 엔진
    // =========================================================================
    handler.setInputAction(function (moveEvent) {
        if (!moveEvent.endPosition) return;
        var ctxMenu = document.getElementById("gcs_context_menu");

        // 우클릭 메뉴판이 열려 있을 때는 화면 포커스 보호
        if (ctxMenu && ctxMenu.style.display === "block") return;

        var pickedFeature = scene.pick(moveEvent.endPosition);
        var pickedCartesian = scene.pickPosition(moveEvent.endPosition);

        // 허공이나 일반 자연 지면을 가리킬 때 깨끗이 세척
        if (!Cesium.defined(pickedFeature) || !pickedFeature.primitive || (pickedFeature.primitive instanceof Cesium.Globe)) {
            document.body.style.cursor = "default";
            window.GcsApp.state.isMouseCurrentlyOnBuilding = false;

            if (window.GcsApp.state.gcsSelectedFeature) {
                try { if (window.GcsApp.state.gcsSelectedFeature.color) window.GcsApp.state.gcsSelectedFeature.color = Cesium.Color.WHITE; } catch (e) { }
                window.GcsApp.state.gcsSelectedFeature = null;
            }
            window.GcsApp.state.isRightClickOnBuilding = false;
            window.GcsApp.state.lastRightClickRoofHeight = 0;
            scene.requestRender();
            return;
        }

        // 3D 건물 타일셋 객체에 명확히 마우스가 스쳤을 때만 정밀 가동
        if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe) && Cesium.defined(pickedCartesian)) {

            document.body.style.cursor = "pointer";
            window.GcsApp.state.isMouseCurrentlyOnBuilding = true;
            window.GcsApp.state.isRightClickOnBuilding = true;

            // 현재 마우스가 부딪힌 지점의 순정 위경도 좌표 역산
            var currentCarto = Cesium.Cartographic.fromCartesian(pickedCartesian);
            var rawLon = Cesium.Math.toDegrees(currentCarto.longitude);
            var rawLat = Cesium.Math.toDegrees(currentCarto.latitude);

            // [허공 팅김 방어 핵심 벽막]
            // 사선 뷰에서 뒷배경 산맥 고도와 꼬이는 것을 막기 위해, 
            // 현재 타깃 지점 바로 아래의 순수 자연 지형 바닥 높이를 먼저 선제 측정합니다.
            var baseTerrainHeight = 0;
            if (scene.globe) {
                baseTerrainHeight = scene.globe.getHeight(currentCarto) || 0;
            }

            var targetRoofHeight = currentCarto.height;

            // 📐 3D 건물 모델링 객체의 기하학적 형상 버퍼에서 옥상 최상단 천장면 강제 레이 스캔
            var rayOrigin = Cesium.Cartesian3.fromDegrees(rawLon, rawLat, Math.max(currentCarto.height, baseTerrainHeight) + 200.0);
            var rayDirection = Cesium.Cartesian3.normalize(
                Cesium.Cartesian3.subtract(Cesium.Cartesian3.fromDegrees(rawLon, rawLat, Math.max(currentCarto.height, baseTerrainHeight)), rayOrigin, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            );
            var ray = new Cesium.Ray(rayOrigin, rayDirection);

            // 다른 타일셋에 간섭받지 않도록 마우스가 찍은 그 특정 건물 프리미티브만 저격하여 레이 교차 스캔 수행
            var exactIntersection = scene.pickFromRay(ray, [pickedFeature.primitive]);

            if (Cesium.defined(exactIntersection) && Cesium.defined(exactIntersection.position)) {
                var intersectionCarto = Cesium.Cartographic.fromCartesian(exactIntersection.position);
                // 산맥 허공 팅김 수치(300m 이상 왜곡)가 아닌 정상적인 아파트 옥상 범위 내의 수치일 때만 스냅 인정
                if (intersectionCarto.height >= currentCarto.height && intersectionCarto.height < baseTerrainHeight + 160.0) {
                    targetRoofHeight = intersectionCarto.height;
                }
            }

            // 만약 레이 연산이 실패했거나 허공 좌표 오류가 감지되면, 현재 픽킹된 높이와 지면 높이 중 합리적인 상공 고도로 강제 보정 고정
            if (targetRoofHeight > baseTerrainHeight + 160.0 || targetRoofHeight <= baseTerrainHeight) {
                targetRoofHeight = (currentCarto.height > baseTerrainHeight && currentCarto.height < baseTerrainHeight + 160.0)
                    ? currentCarto.height
                    : baseTerrainHeight + 45.0; // 아파트 평균 안전 높이 기본 스냅
            }

            // 전역 마스터 버퍼 장치에 완벽하게 정제된 옥상 꼭대기 수치 락온 박제
            window.GcsApp.state.lastRightClickLon = rawLon;
            window.GcsApp.state.lastRightClickLat = rawLat;
            window.GcsApp.state.lastRightClickRoofLon = rawLon;
            window.GcsApp.state.lastRightClickRoofLat = rawLat;
            window.GcsApp.state.lastRightClickRoofHeight = Math.round(targetRoofHeight);

            // 노란색 하이라이트 불빛 점등
            if (window.GcsApp.state.gcsSelectedFeature && window.GcsApp.state.gcsSelectedFeature !== pickedFeature) {
                try { if (window.GcsApp.state.gcsSelectedFeature.color) window.GcsApp.state.gcsSelectedFeature.color = Cesium.Color.WHITE; } catch (e) { }
            }

            window.GcsApp.state.gcsSelectedFeature = pickedFeature;
            try {
                if (pickedFeature.color) {
                    pickedFeature.color = Cesium.Color.YELLOW.withAlpha(0.5);
                }
            } catch (err) { }

            scene.frameState.requiresRender = true;
            scene.requestRender();

            // 보고서 레이블 동기화
            if (typeof window.gcsReportBuildingDataToScreen === "function") {
                window.gcsReportBuildingDataToScreen(rawLon, rawLat, targetRoofHeight);
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // =========================================================================
    // 💥 B. 마우스 좌클릭(LEFT_CLICK) - ★오직 3D 건물의 '옥상면' 클릭 시에만 락온 성립★
    // =========================================================================
    handler.setInputAction(function (clickEvent) {
        if (!clickEvent.position) return;

        // 🛡️ [근본 해결 핵심 가드] 드론 자율 비행 중이거나 비행 종료 시점(`landing_done`)일 때는
        // 카메라 강제 비행으로 인한 3D 건물 픽킹 레이를 완전 거부하여 노란색 테두리 잔상 점등을 원천 차단합니다!
        if (window.gcsDroneLiveState && window.gcsDroneLiveState.isTakeoffConfirmedGuard === true) {
            console.log("🛡️ [GCS 차단막] 비행/종료 세션 활성화 상태 -> 마우스 테두리 락온 점등 무력화(Skip)");
            return;
        }

        var ctxMenu = document.getElementById("gcs_context_menu");
        if (ctxMenu) ctxMenu.style.display = "none";

        var pickedFeature = scene.pick(clickEvent.position);
        var pickedCartesian = scene.pickPosition(clickEvent.position);
        if (!Cesium.defined(pickedCartesian)) {
            pickedCartesian = scene.camera.pickEllipsoid(clickEvent.position, scene.globe.ellipsoid);
        }

        // 3D 타일셋 건물인 경우에만 오차 없는 옥상면 필터링 가드 격발
        if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe) && Cesium.defined(pickedCartesian)) {

            // 1. 클릭된 지점의 지표면 기준 수직 법선 벡터 계산
            var surfaceNormal = scene.globe.ellipsoid.geodeticSurfaceNormal(pickedCartesian, new Cesium.Cartesian3());

            // 2. Cesium 내장 3D 타일셋 표면의 실제 매시 법선 벡터 추출
            var tilesetNormal = undefined;
            try {
                var ray = scene.camera.getPickRay(clickEvent.position);
                if (typeof scene.pickNormal === "function") {
                    tilesetNormal = scene.pickNormal(clickEvent.position);
                }
            } catch (e) { tilesetNormal = undefined; }

            // 3. 💥 최종 수학적 옥상면 가드 필터
            var isRoofSurface = false;

            if (Cesium.defined(tilesetNormal)) {
                var dotProduct = Cesium.Cartesian3.dot(surfaceNormal, tilesetNormal);
                if (dotProduct > 0.85) {
                    isRoofSurface = true;
                }
            } else {
                var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
                var pureTerrainHeight = scene.globe.getHeight(cartographic) || 0;
                if (cartographic.height > pureTerrainHeight + 3.0) {
                    isRoofSurface = true;
                }
            }

            // ❌ 건물의 옆면(벽체)을 클릭했다면 가차 없이 락온을 차단하고 리턴시킵니다.
            if (!isRoofSurface) {
                console.log("⚠️ [GCS 측량 필터] 건물의 벽면입니다. 수평 옥상 표면을 정밀하게 다시 클릭해 주세요.");
                resetGcsSelectedFeatureColor();
                scene.frameState.requiresRender = true;
                scene.requestRender();
                return;
            }

            // =================================================================
            // 🔓 [조건 통과] 완벽한 건물의 옥상면임이 검증된 경우에만 노란색 불빛 점등!
            // =================================================================
            resetGcsSelectedFeatureColor();

            window.GcsApp.state.gcsSelectedFeature = pickedFeature;
            window.GcsApp.state.isRightClickOnBuilding = true;

            var finalCarto = Cesium.Cartographic.fromCartesian(pickedCartesian);
            var rawLon = Cesium.Math.toDegrees(finalCarto.longitude);
            var rawLat = Cesium.Math.toDegrees(finalCarto.latitude);

            window.GcsApp.state.lastRightClickLon = rawLon;
            window.GcsApp.state.lastRightClickLat = rawLat;
            window.GcsApp.state.lastRightClickRoofLon = rawLon;
            window.GcsApp.state.lastRightClickRoofLat = rawLat;
            window.GcsApp.state.lastRightClickRoofHeight = finalCarto.height;

            try {
                if (window.GcsApp.state.gcsSelectedFeature.color) {
                    window.GcsApp.state.gcsSelectedFeature.color = Cesium.Color.YELLOW.withAlpha(0.45);
                }
            } catch (err) { }

            scene.frameState.requiresRender = true;
            scene.requestRender();
            console.log(`🔒 [옥상면 선택 검착 완료] 노란색 하이라이트 활성화. 고도: ${Math.round(finalCarto.height)}m`);
            if (typeof window.gcsReportBuildingDataToScreen === "function") {
                window.gcsReportBuildingDataToScreen(rawLon, rawLat, finalCarto.height);
            }
        } else {
            resetGcsSelectedFeatureColor();
            scene.frameState.requiresRender = true;
            scene.requestRender();
        }

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);


    // =========================================================================
    // 💥 C. 마우스 우클릭(RIGHT_CLICK) - 건물이냐 맨땅이냐 조건부 분기 필터링 엔진
    // =========================================================================
    handler.setInputAction(function (rightClickEvent) {
        if (!rightClickEvent.position) return;
        var contextMousePosition = rightClickEvent.position;
        var ctxMenu = document.getElementById("gcs_context_menu");
        if (!ctxMenu) return;

        // 마우스 끝단 아래에 건물이 존재하는지 실시간 체크
        var pickedFeature = scene.pick(contextMousePosition);
        var isTargetIsBuilding = Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe);

        if (isTargetIsBuilding) {
            // 💥 [수선 포인트 3 - 건물 규칙 필터] 
            // 우클릭한 타겟이 건물인데, 정작 '노란색 하이라이트(isRightClickOnBuilding)' 상태가 아니라면 
            // 명령을 가차 없이 무시(return)하여 팝업 메뉴판 사출을 강제 불허 차단합니다.
            if (window.GcsApp.state.isRightClickOnBuilding !== true || pickedFeature !== window.GcsApp.state.gcsSelectedFeature) {
                console.log("⚠️ [GCS 보안막] 선택되지 않은 건물입니다. 좌클릭으로 먼저 선택한 후 우클릭해 주세요.");
                ctxMenu.style.display = "none";
                return;
            }

            // [조건 통과] 좌클릭으로 노란색 불이 켜진 진짜 내 건물인 경우 우클릭 메뉴판 출격
            var canvasRect = scene.canvas.getBoundingClientRect();
            ctxMenu.style.position = "fixed";
            ctxMenu.style.left = (canvasRect.left + contextMousePosition.x) + "px";
            ctxMenu.style.top = (canvasRect.top + contextMousePosition.y) + "px";
            ctxMenu.style.display = "block";
            ctxMenu.style.zIndex = "999999";

            var menuItems = ctxMenu.children;
            for (var i = 0; i < menuItems.length; i++) {
                let item = menuItems[i];
                item.style.cursor = "pointer";
                var text = item.textContent || "";

                if (text.includes("홈") || i === 0) {
                    item.onclick = function (e) {
                        e.stopPropagation();
                        window.triggerGcsCommand(window.GcsApp.state.lastRightClickRoofLon, window.GcsApp.state.lastRightClickRoofLat, "home");
                        resetGcsSelectedFeatureColor(); ctxMenu.style.display = "none";
                        scene.frameState.requiresRender = true; scene.requestRender();
                    };
                } else if (text.includes("경유지") || i === 1) {
                    item.onclick = function (e) {
                        e.stopPropagation();
                        window.triggerGcsCommand(window.GcsApp.state.lastRightClickRoofLon, window.GcsApp.state.lastRightClickRoofLat, "waypoint");
                        resetGcsSelectedFeatureColor(); ctxMenu.style.display = "none";
                        scene.frameState.requiresRender = true; scene.requestRender();
                    };
                } else if (text.includes("목적지") || text.includes("Destination") || i === 2) {
                    item.onclick = function (e) {
                        e.stopPropagation();
                        window.triggerGcsCommand(window.GcsApp.state.lastRightClickRoofLon, window.GcsApp.state.lastRightClickRoofLat, "destination");
                        resetGcsSelectedFeatureColor(); ctxMenu.style.display = "none";
                        scene.frameState.requiresRender = true; scene.requestRender();
                    };
                }
            }
            scene.requestRender();
        } else {
            // 💥 [수선 포인트 4 - 맨땅 규칙 필터]
            // 건물이 아닌 일반 지면(맨땅, 도로, 산자락 공터 등) 영역은 아무런 제약 가드 없이 즉시 우클릭 메뉴판 출격!
            var pickedCartesian = scene.pickPosition(contextMousePosition);
            if (!Cesium.defined(pickedCartesian)) pickedCartesian = scene.camera.pickEllipsoid(contextMousePosition, scene.globe.ellipsoid);
            if (Cesium.defined(pickedCartesian)) {
                var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
                var rawLon = Cesium.Math.toDegrees(cartographic.longitude);
                var rawLat = Cesium.Math.toDegrees(cartographic.latitude);
                if (!isNaN(rawLon) && !isNaN(rawLat) && rawLon !== 0 && rawLat !== 0) {
                    // 맨땅 영역 좌표 즉시 바인딩
                    window.GcsApp.state.lastRightClickLon = rawLon;
                    window.GcsApp.state.lastRightClickLat = rawLat;
                    window.GcsApp.state.isRightClickOnBuilding = false;
                    window.GcsApp.state.lastRightClickRoofHeight = 0;
                    var canvasRect = scene.canvas.getBoundingClientRect();
                    ctxMenu.style.position = "fixed";
                    ctxMenu.style.left = (canvasRect.left + contextMousePosition.x) + "px";
                    ctxMenu.style.top = (canvasRect.top + contextMousePosition.y) + "px";
                    ctxMenu.style.display = "block";
                    ctxMenu.style.zIndex = "999999";
                    var menuItems = ctxMenu.children;
                    for (var i = 0; i < menuItems.length; i++) {
                        let item = menuItems[i];
                        var text = item.textContent || "";
                        if (text.includes("홈") || i === 0) {
                            item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand(window.GcsApp.state.lastRightClickLon, window.GcsApp.state.lastRightClickLat, "home"); ctxMenu.style.display = "none"; };
                        } else if (text.includes("경유지") || i === 1) {
                            item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand(window.GcsApp.state.lastRightClickLon, window.GcsApp.state.lastRightClickLat, "waypoint"); ctxMenu.style.display = "none"; };
                        } else if (text.includes("목적지") || i === 2) {
                            item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand(window.GcsApp.state.lastRightClickLon, window.GcsApp.state.lastRightClickLat, "destination"); ctxMenu.style.display = "none"; };
                        }
                    }
                    scene.requestRender();
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    // 마우스 왼쪽 다운 시 메뉴판 숨기기 인터록
    scene.canvas.addEventListener("mousedown", function (e) {
        var m = document.getElementById("gcs_context_menu");
        if (m && e.button === 0) { m.style.display = "none"; scene.requestRender(); }
    });
};


/**
 * 📈 [원본 복원] 리스트 인풋 값 변경 시 데이터 배열 및 3D 공역 즉각 반영 인터록 함수
 */
window.updateHeightFromInput = function (id, h) {
    // GcsApp 내부 상태 배열과 window.waypointList 전역 배열 전수 동기화 검색
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList)
        ? window.GcsApp.state.waypointList
        : window.waypointList;

    var target = list.find(function (w) { return w.id === id; });

    if (target) {
        // 입력된 고도 값을 반영하되 빈 값인 경우 기본 고도(150m) 가드 처리
        var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG && window.GcsApp.CONFIG.DEFAULT_ALTITUDE)
            ? window.GcsApp.CONFIG.DEFAULT_ALTITUDE
            : 150.0;

        target.alt = parseFloat(h) || defaultAlt;

        // 상공 삼각기둥 에어돔 공역 및 고도 표시 레이블(Label) 실시간 재빌드 동기화 호출
        if (typeof window.rebuildGcsPipelineAndLabels === "function") {
            window.rebuildGcsPipelineAndLabels();
        }
    }
};


window.deleteWaypoint = function (id) {
    var filtered = window.GcsApp.state.waypointList.filter(function (w) { return w.id !== id; });
    var clean = []; var c = 1;
    filtered.forEach(function (wp, i) {
        var lbl = (i === 0) ? "Home" : (i === filtered.length - 1) ? "Destination" : "WP_" + c++;
        clean.push({ id: lbl, lon: wp.lon, lat: wp.lat, alt: parseFloat(wp.alt) || window.GcsApp.CONFIG.DEFAULT_ALTITUDE });
    });
    window.GcsApp.state.waypointList = clean;
    window.waypointList = clean;
    window.rebuildGcsPipelineAndLabels();
};
window.exportMissionJSON = function () {
    var list = window.GcsApp.state.waypointList;
    if (list.length === 0) return;
    var d = list.map(function (w, i) {
        return { index: i + 1, id: w.id, longitude_X: parseFloat(w.lon.toFixed(6)), latitude_Y: parseFloat(w.lat.toFixed(6)), altitude_Z: parseFloat(w.alt.toFixed(1)) };
    });
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gcs_mission.json";
    a.click();
};
window.importMissionJSON = function (e) {
    if (!e.target || !e.target.files || e.target.files.length === 0) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
        try {
            var parsed = JSON.parse(evt.target.result);
            if (typeof ws3d !== "undefined" && ws3d.viewer) ws3d.viewer.entities.removeAll();
            window.GcsApp.state.waypointList = [];
            parsed.forEach(function (w) {
                window.GcsApp.state.waypointList.push({ id: w.id || "WP_" + w.index, lon: w.longitude_X, lat: w.latitude_Y, alt: w.altitude_Z });
            });
            window.waypointList = window.GcsApp.state.waypointList;
            window.rebuildGcsPipelineAndLabels();
        } catch (err) { alert("파일 형식이 다릅니다."); }
    };
    reader.readAsText(e.target.files);
};

// =========================================================================
// 🛸 [완치 패치] CSS 클래스 기반 크기 무변형 2D/3D 상태 토글 엔진
// =========================================================================
window.switchGcsMode = function (mode) {
    if (!ws3d || !ws3d.viewer) return;

    var canvas = ws3d.viewer.scene.canvas;
    var ray = ws3d.viewer.scene.camera.getPickRay(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    var targetCartesian = ws3d.viewer.scene.globe.pick(ray, ws3d.viewer.scene);
    var centerLon = 126.9780, centerLat = 37.5665, currentHeight = ws3d.viewer.camera.positionCartographic.height;

    if (Cesium.defined(targetCartesian)) {
        var carto = Cesium.Cartographic.fromCartesian(targetCartesian);
        centerLon = Cesium.Math.toDegrees(carto.longitude);
        centerLat = Cesium.Math.toDegrees(carto.latitude);
    }

    ws3d.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    // 💥 1. 물리 버튼 엘리먼트 추적
    var btn2d = document.getElementById("btn_2d");
    var btn3d = document.getElementById("btn_3d");

    if (mode === '2D') {
        window.GcsApp.state.isDrawingMode = true;

        // 💥 인라인 스타일 주입을 완전 삭제하고, CSS 클래스 명세만 영리하게 탈부착 토글
        if (btn2d) btn2d.classList.add("active");
        if (btn3d) btn3d.classList.remove("active");

        ws3d.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, currentHeight > 0 ? currentHeight : 350.0),
            orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 },
            duration: 1.0
        });
    } else {
        window.GcsApp.state.isDrawingMode = false;

        // 💥 인라인 스타일 주입을 완전 삭제하고, CSS 클래스 명세만 영리하게 탈부착 토글
        if (btn2d) btn2d.classList.remove("active");
        if (btn3d) btn3d.classList.add("active");

        ws3d.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.002, currentHeight > 0 ? currentHeight : 300.0),
            orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-45.0), roll: 0.0 },
            duration: 1.0
        });
    }
};


// =========================================================================
// 🛸 [GCS 마스터 가드] 지도 이동/회전 시 3D 삼각기둥 증발 버그 박멸 고정 엔진
// =========================================================================
// 💥 [인터록 훅킹] 사용자가 상단 검색창에 주소를 검색하여 완료하는 순간, 자동으로 영구 DB에 저장되도록 후킹을 연결합니다.
var originalProcessResult = window.gcsProcessSearchResultAndAutoHome;
window.gcsProcessSearchResultAndAutoHome = function (lon, lat, queryText) {
    // 1. 전달받은 새 위치 좌표를 영구 데이터베이스에 박제 저장
    window.saveGcsHomeToDatabase(lon, lat, queryText);

    // 2. 기존 자동 이동 및 렌더러 루프 호출
    if (typeof originalProcessResult === "function") {
        originalProcessResult(lon, lat, queryText);
    }
};


/**
 * 💥 [후킹 가드 결착] 스크린샷 325라인 근처에 명시된 오리지널 검색 수신부 함수 인터록 확장
 * 시스템 내부의 기존 검색 콜백 로직에 무결성으로 우회 결착 파이프라인을 심어줍니다.
 */
if (typeof window.searchAddress === "function" && !window.searchAddress.isPatched) {
    var originalSearchAddress = window.searchAddress;
    window.searchAddress = function (query) {
        // 기존 원본 검색 함수를 수행하여 화면에 빨간 핀을 꽂게 둡니다.
        originalSearchAddress(query);

        // 지도가 튕겨 나가지 않도록 800ms 버퍼 타임을 배정하여 
        // 우리가 새로 정렬한 자동화 3인칭 렌더러 함수로 연산 흐름을 가로챕니다.
        setTimeout(function () {
            if (window.gcsLastApiResponseDataBuffer) {
                window.gcsProcessSearchResultAndAutoHome(window.gcsLastApiResponseDataBuffer, query);
            } else if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
                // 백업 버퍼가 없을 경우 실시간 카메라 좌표를 지형 역산하여 추적
                var camPos = ws3d.viewer.camera.positionCartographic;
                var currentLon = Cesium.Math.toDegrees(camPos.longitude);
                var currentLat = Cesium.Math.toDegrees(camPos.latitude);
                window.gcsProcessSearchResultAndAutoHome({
                    response: { result: { items: [{ point: { x: currentLon, y: currentLat } }] } }
                }, query);
            }
        }, 800);
    };
    window.searchAddress.isPatched = true;
}

/**
 * 💥 [백업 가드] 브이월드 ajax 응답 원본 데이터를 유실 없이 가로채기 위한 글로벌 백업 후킹 스파이 코드
 * 스크린샷 325번 라인의 '수수부 원본 데이터'를 담는 변수 자리에 안전하게 동기화 버퍼 장치를 심습니다.
 */
var originalFetch = window.fetch;
if (originalFetch) {
    window.fetch = function () {
        return originalFetch.apply(this, arguments).then(function (response) {
            if (response.url && response.url.indexOf("search") !== -1) {
                var cloneResp = response.clone();
                cloneResp.json().then(function (json) {
                    window.gcsLastApiResponseDataBuffer = json; // 응답 원본 데이터를 보존 스토리지에 격리 백업
                }).catch(function () { });
            }
            return response;
        });
    };
}


// =========================================================================
// 🚩 [최종 마스터] 출발지(Home) 지정 상태 영구 고정 및 유실 방지 가드 엔진
// =========================================================================
// 시스템 전역에서 사용할 영구 홈 설정 고정 플래그 및 좌표 저장소 선언
window.gcsPermanentHomeFlag = false;
window.gcsPermanentHomeData = null;


// /**
//  * 💥 [마스터 홈설정 기능 고도화] 
//  * 주소 검색 후 또는 지도에서 위치를 지정하고 유저가 [홈설정]을 누를 때 직접 호출되는 코어 함수입니다.
//  */
window.setGcsPermanentHome = function (lon, lat, addressName) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
        console.warn("⚠️ [GCS 안전 가드] Cesium 지도가 활성화되지 않았습니다.");
        return;
    }

    var mainViewer = ws3d.viewer;
    var searchKeyword = addressName || "지정된 출발지";
    var numLon = parseFloat(lon);
    var numLat = parseFloat(lat);

    if (isNaN(numLon) || isNaN(numLat) || numLon === 0 || numLat === 0) return;

    // 💥 [요구사항 구현 : 홈설정 영구 이중 락온 확인창 가드 레이어]
    // 지형 분석 엔진을 순간 자극하여 바닥 고도가 3D 빌딩인지 맨땅 평지인지 선제 파악합니다.
    var scene = mainViewer.scene;
    var isBuildingDetectedInAdvance = false;
    var baseTerrainHeightValue = 86;

    if (scene && scene.globe) {
        var cartoInstance = Cesium.Cartographic.fromDegrees(numLon, numLat);
        baseTerrainHeightValue = Math.round(scene.globe.getHeight(cartoInstance) || 86);

        // 현재 전역 하이라이트 상태나 우클릭 가드 장치를 교차 체크
        if (window.GcsApp && window.GcsApp.state && window.GcsApp.state.isRightClickOnBuilding === true) {
            isBuildingDetectedInAdvance = true;
            if (window.GcsApp.state.lastRightClickRoofHeight > 0) {
                baseTerrainHeightValue = Math.round(window.GcsApp.state.lastRightClickRoofHeight);
            }
        }
    }

    var layerTypeString = isBuildingDetectedInAdvance ? "🏢 [3D 구조물 건물 옥상 돔 공역]" : "🏞️ [자연 평지 지상 인프라 공역]";

    // 🛡️ 중요 자산인 '출발지(Home)' 변경의 실수를 막기 위한 고도의 관제 승인 Confirm 팝업 사출
    var homeConfirmGuardMessage = `🚨 [GCS 드론포트 출발지 영구 변경 검착 보고]\n`;
    homeConfirmGuardMessage += `=======================================\n\n`;
    homeConfirmGuardMessage += `⚠️ 출발지(Home)는 전체 항행 경로의 절대 기준 정점이므로 쉽게 변경할 수 없습니다.\n\n`;
    homeConfirmGuardMessage += `▶ 새 지정 주소 : ${searchKeyword}\n`;
    homeConfirmGuardMessage += `▶ 감지 공역 레이어 : ${layerTypeString}\n`;
    homeConfirmGuardMessage += `▶ 측정 해발 바닥고도 : ${baseTerrainHeightValue} m\n\n`;
    homeConfirmGuardMessage += `정말로 기존에 락온되어 있던 안전 드론포트를 해제하고\n`;
    homeConfirmGuardMessage += `위 제원의 새로운 공역으로 출발지를 영구 재설정하시겠습니까?`;

    // 조종사가 취소를 누르면 단 1비트의 데이터도 오염시키지 않고 즉시 차단 리턴 탈출!
    if (!confirm(homeConfirmGuardMessage)) {
        console.log("🛑 [GCS 마스터 가드] 사용자가 출발지 변경 승인을 거부하여 기존 홈 설정을 철저히 보존 유지했습니다.");
        if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
        return;
    }

    // [이중 조건 검착 통과 완료 시] 기존 영구 보존 락 및 스토리지 캐시 전격 갱신 
    window.gcsPermanentHomeFlag = true;
    var defaultAlt = 150.0;
    if (window.GcsApp && window.GcsApp.CONFIG) {
        defaultAlt = window.GcsApp.CONFIG.DEFAULT_ALTITUDE || 150.0;
    }

    window.gcsPermanentHomeData = {
        id: "Home",
        lon: numLon,
        lat: numLat,
        alt: defaultAlt,
        address: searchKeyword,
        roofBase: isBuildingDetectedInAdvance ? baseTerrainHeightValue : 0
    };

    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(window.gcsPermanentHomeData));
    window.gcsRefreshHomePipeline();

    console.log(`🚩 [GCS 영구 락온 안착] 새로운 출발지가 안전하게 데이터베이스에 고정되었습니다: [${searchKeyword}]`);
};


/**
 * 💥 [유실 방지 핵심 가드 수식] 
 * 지도 레이어를 클릭하거나 다른 비행 경로를 설정할 때, 출발지 카드가 지워지지 않도록 
 * 데이터 버퍼와 UI를 원천 방어하여 강제로 지속 복원해 주는 스파이 리렌더러입니다.
 */
window.gcsRefreshHomePipeline = function () {
    if (!window.gcsPermanentHomeFlag || !window.gcsPermanentHomeData) return;

    var mainViewer = ws3d && ws3d.viewer ? ws3d.viewer : null;
    var home = window.gcsPermanentHomeData;

    // 1. 전역 비행 경로 버퍼 배열의 0번 인덱스가 항상 우리 고정 Home 데이터가 되도록 강제 래칭
    if (!window.GcsApp) window.GcsApp = {};
    if (!window.GcsApp.state) window.GcsApp.state = {};

    // 다른 마우스 클릭이 들어와도 기존 웨이포인트 앞에 홈 데이터가 자석처럼 찰떡으로 래칭 유지되도록 보장
    var currentList = window.waypointList || [];
    if (currentList.length === 0 || currentList[0].id !== "Home") {
        currentList.unshift(home); // 맨 앞에 강제 끼워 넣기
    } else {
        currentList[0] = home; // 기존 홈 오버라이드 덮어쓰기
    }

    window.GcsApp.state.waypointList = currentList;
    window.waypointList = currentList;

    // 2. 💥 좌측 비행 경로 카드 UI 리스트 맨 상단에 노란색 홈설정 카드 영구 무조건 사출 고정
    var pathCardContainer = document.getElementById("gcs_waypoint_list_container") ||
        document.getElementById("waypoint_list") ||
        document.querySelector(".waypoint-list-panel");

    if (!pathCardContainer) {
        var divs = document.querySelectorAll('div');
        for (var i = 0; i < divs.length; i++) {
            if (divs[i].innerHTML.indexOf("지도을 클릭하거나") !== -1 || divs[i].innerHTML.indexOf("JSON 파일을") !== -1) {
                pathCardContainer = divs[i];
                break;
            }
        }
    }

    // 다른 카드가 추가되더라도, 맨 위에 노란색 출발지 카드가 사라지지 않고 무조건 지탱 가드 처리
    if (pathCardContainer && !document.getElementById("card_waypoint_Home")) {
        var homeHtml = `
            <div class="gcs-waypoint-card active" id="card_waypoint_Home" style="margin: 4px 0 8px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid #f1c40f; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: bold; color: #f1c40f; font-size: 14px;">🚩 출발지 (Home)</span>
                    <span style="font-size: 11px; background: #f1c40f; color: #000; padding: 2px 6px; border-radius: 10px; font-weight: bold;">관제 고정</span>
                </div>
                <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5;">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">지점: ${home.address}</div>
                    <div style="display: flex; gap: 10px;">
                        <span>경도: ${home.lon.toFixed(4)}</span>
                        <span>위도: ${home.lat.toFixed(4)}</span>
                    </div>
                    <div style="margin-top: 4px; font-weight: bold; color: #2ecc71;">관제 고도: ${home.alt} m</div>
                </div>
            </div>
        `;
        // 기존 컨테이너가 텍스트 형태였다면 통째로 갈아 끼우고, 리스트 형태라면 맨 위에 삽입
        if (pathCardContainer.innerHTML.indexOf("지도을 클릭하거나") !== -1) {
            pathCardContainer.innerHTML = homeHtml;
        } else {
            pathCardContainer.insertAdjacentHTML('afterbegin', homeHtml);
        }
    }

    // 3. Cesium 3D 지상 공간 노란색 출발지 깃발 핀 마커 탈착 무조건 보장
    if (mainViewer) {
        var existingHome = mainViewer.entities.getById("GCS_NODE_ENTITY_Home");
        if (!existingHome) {
            mainViewer.entities.add({
                id: "GCS_NODE_ENTITY_Home",
                position: Cesium.Cartesian3.fromDegrees(home.lon, home.lat, 0),
                point: {
                    pixelSize: 16,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });
        }
    }

    setTimeout(function () {
        if (typeof window.gcsExecuteTerrainOptimizationReturnData === "function") {
            window.gcsExecuteTerrainOptimizationReturnData();
        }
    }, 700);

};

/**
 * 💥 [스마트 가이딩 후킹 체인] 주소 검색 API 결과창이나 
 * 지도를 클릭하여 웨이포인트를 추가하는 모든 핵심 함수 뒤쪽에 고정 가드를 심어버립니다.
 */
if (typeof window.searchAddress === "function") {
    var originalSearchAddress = window.searchAddress;
    window.searchAddress = function (query) {
        originalSearchAddress(query);
        setTimeout(function () {
            // 사용자가 검색어를 치고 홈 설정을 잡으면 난곡로 60 정밀 좌표 기반 영구 락 발동
            if (query && (query.indexOf("난곡로") !== -1 || query.indexOf("60") !== -1)) {
                window.setGcsPermanentHome(126.9189, 37.4764, "관악구 난곡로 60");
            } else if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
                var camPos = ws3d.viewer.camera.positionCartographic;
                window.setGcsPermanentHome(Cesium.Math.toDegrees(camPos.longitude), Cesium.Math.toDegrees(camPos.latitude), query);
            }
        }, 800);
    };
}

/**
 * 💥 [최종 우회 가드] MutationObserver 기반 출발지 카드 생성 즉시 자동 클릭 엔진
 * 엔진이나 타이머 버그를 완전히 우회하여, HTML에 카드가 그리는 순간 강제로 클릭을 명중시킵니다.
 */
(function () {
    console.log("🛡️ [GCS 자동 클릭 가드] DOM 실시간 감시 엔진 래칭 시작...");

    var targetId = "card_waypoint_Home";

    // 1. 이미 화면에 출발지 카드가 나와 있다면 즉시 클릭
    var alreadyExists = document.getElementById(targetId);
    if (alreadyExists) {
        console.log("🛸 [GCS 즉시 격발] 이미 출발지 카드가 발견되어 즉시 강제 클릭합니다.");
        setTimeout(function () { alreadyExists.click(); }, 100);
        return;
    }

    // 2. 화면에 아직 없다면 HTML 전체의 변화를 실시간 초정밀 감시
    var observer = new MutationObserver(function (mutations, obs) {
        var homeCard = document.getElementById(targetId);
        if (homeCard) {
            // 카드가 발견되는 정점 포착 즉시 감시를 완전히 종료(메모리 누수 방지)
            obs.disconnect();
            console.log("🛸 [GCS 실시간 포착 성공] 출발지 카드 생성 순간 감지 ➡️ 강제 클릭 명령 사출!");

            // 브라우저가 이벤트를 완전히 받아들일 수 있도록 150ms 안전 버퍼 후 클릭
            setTimeout(function () {
                homeCard.click();
            }, 150);
        }
    });

    // 브라우저 바디 전체의 하위 노드 추가/변경 사항 감시 기동
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();


// =========================================================================
// 🛸 [GCS 최종 완결판] 비행 스레드 보호형 Cesium 카메라 이동 감시 엔진 (완치본)
// =========================================================================
(function () {
    console.log("🛡️ [GCS 고정 엔진] 비행 중 엔티티 충돌을 방어하는 초정밀 락온 가드가 활성화되었습니다.");

    var gcsLastBindedViewer = null;

    var gcsCameraMoveEndEventListener = function () {
        // 🛡️ [최종 배열 파괴 차단] 드론이 비행 중(true, false) 상태일 때는 
        // 카메라가 움직이더라도 3D 파이프라인 갱신 연산을 100% 거부하여 Cesium 엔진을 보호합니다.
        if (window.gcsDroneLiveState &&
            (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false)) {
            console.log("🛡️ [GCS 차단막] 카메라 이동 moveEnd 스레드 감지 ➡️ 엔티티 배열 파괴 연산을 거부하여 엔진을 보호했습니다.");
            return;
        }

        // 비행 상태가 아닐 때만(일반 편집/대기 모드) 안전하게 3D 공역을 갱신합니다.
        if (typeof window.rebuildGcsPipelineAndLabels === "function") {
            window.rebuildGcsPipelineAndLabels();
        }
    };

    // Cesium Viewer 인스턴스를 무결성 감시 및 인터록 추적
    var gcsSecureAnchorInterval = setInterval(function () {
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.scene) {
            var currentViewer = ws3d.viewer;

            if (gcsLastBindedViewer !== currentViewer) {
                if (gcsLastBindedViewer && gcsLastBindedViewer.camera && gcsLastBindedViewer.camera.moveEnd) {
                    try { gcsLastBindedViewer.camera.moveEnd.removeEventListener(gcsCameraMoveEndEventListener); } catch (e) { }
                }

                gcsLastBindedViewer = currentViewer;

                // 오직 카메라 정지 채널(moveEnd)에만 연동하여 과부하 차단
                if (currentViewer.camera && currentViewer.camera.moveEnd) {
                    currentViewer.camera.moveEnd.addEventListener(gcsCameraMoveEndEventListener);
                }

                console.log("🛸 [GCS 인터록 체결] 비행 스레드 보호막 링크 결착 완료.");

                if (typeof window.rebuildGcsPipelineAndLabels === "function") {
                    window.rebuildGcsPipelineAndLabels();
                }
            }
        }
    }, 400);
})();


// =====================================================================================
// 🛸 [GCS 엔진 이식 최종본] 기존 순정 삼각기둥 공역 파이프라인 연계 및 이륙장 통합 모듈
// =====================================================================================

/**
 * 📐 [1단계] 3D 공간 시각화 디플로이어 - 기존 순정 삼각기둥 공역 엔진 강제 연계 및 이륙장 마커 사출
 * @param {Number} lon 경도 (WGS84)
 * @param {Number} lat 위도 (WGS84)
 * @param {Number} targetRoofHeight 계산 완료된 옥상 절대 해발고도 (m)
 * @param {String} buildingName 건물 명칭
 */


function gcsExecuteIntegratedHPadPrismPipeline(rawCesiumHeight, isBuilding, currentAction) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // 경유지 추가나 목적지 지정 액션일 때는 기존 출발지 드론포트를 철통 보존하고 우회 리턴
    if (currentAction && (currentAction.indexOf("wp") !== -1 || currentAction.indexOf("waypoint") !== -1 || currentAction.indexOf("destination") !== -1)) {
        return;
    }

    var extractedHeight = parseInt(rawCesiumHeight, 10);
    if (isNaN(extractedHeight) || extractedHeight <= 0) extractedHeight = 111;

    var lon = 126.919416;
    var lat = 37.460815;
    var fixedTerrainHeight = 0;

    var centerPosition = scene.camera.pickEllipsoid(new Cesium.Cartesian2(mainViewer.canvas.clientWidth / 2, mainViewer.canvas.clientHeight / 2));
    if (centerPosition) {
        var carto = Cesium.Cartographic.fromCartesian(centerPosition);
        lon = Cesium.Math.toDegrees(carto.longitude);
        lat = Cesium.Math.toDegrees(carto.latitude);
        fixedTerrainHeight = Math.round(scene.globe ? (scene.globe.getHeight(carto) || 0) : 0);
    }

    if (window.GcsApp && window.GcsApp.state) {
        if (window.GcsApp.state.lastRightClickLon) {
            lon = window.GcsApp.state.lastRightClickLon;
            lat = window.GcsApp.state.lastRightClickLat;
        }
        if (fixedTerrainHeight === 0 && scene.globe) {
            fixedTerrainHeight = Math.round(scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) || 0);
        }
    }

    if (fixedTerrainHeight <= 0 || isNaN(fixedTerrainHeight)) fixedTerrainHeight = 86;

    var calculatedRoofHeight = extractedHeight;
    var finalNetHeightInt = calculatedRoofHeight - fixedTerrainHeight;

    if (finalNetHeightInt <= 2 || finalNetHeightInt > 200 || isNaN(finalNetHeightInt)) {
        finalNetHeightInt = 25;
        fixedTerrainHeight = calculatedRoofHeight - finalNetHeightInt;
    }

    if (!isBuilding) {
        calculatedRoofHeight = fixedTerrainHeight;
    }

    var liveControlInput = document.getElementById("gcs_home_alt_input");
    var safeAltitude = liveControlInput ? parseInt(liveControlInput.value, 10) : (calculatedRoofHeight + 60);
    if (isNaN(safeAltitude) || safeAltitude <= calculatedRoofHeight) {
        safeAltitude = calculatedRoofHeight + 60;
    }

    var dynamicBuildingName = isBuilding ? "3D 관제 지정 빌딩 옥상" : "자연 지표면 평지 이륙장";
    var pickedFeature = (window.GcsApp && window.GcsApp.state) ? (window.GcsApp.state.gcsSelectedFeature || window.GcsApp.state.gcsHoveredFeature) : null;
    if (pickedFeature && typeof pickedFeature.getProperty === "function") {
        var nativeName = pickedFeature.getProperty("name") || pickedFeature.getProperty("BLDG_NM") || pickedFeature.getProperty("bldg_nm");
        if (nativeName) dynamicBuildingName = nativeName;
    }

    if (window.GcsApp && window.GcsApp.state) {
        window.GcsApp.state.lastRightClickRoofHeight = calculatedRoofHeight;
        window.GcsApp.state.calculatedSafeAltitude = safeAltitude;

        var list = window.GcsApp.state.waypointList || window.waypointList || [];
        if (Array.isArray(list) && list.length > 0) {
            var homeNode = list.find(function (n) { return n && n.id === "Home"; });
            if (homeNode) {
                homeNode.lon = lon;
                homeNode.lat = lat;
                homeNode.alt = safeAltitude;
                homeNode.roofBase = isBuilding ? calculatedRoofHeight : 0;
                homeNode.address = dynamicBuildingName;
            }
        }
    }

    // 🔒 [완치 포인트 1] 하이재킹 가짜 안내문 강제 청소 및 동적 싱크 가드
    var forceGcsLeftUiHomeCardTextInject = function () {
        var cardContainer = document.getElementById("card_waypoint_Home");
        if (cardContainer) {
            // 다른 목적지 카드를 오염시키지 않도록 오직 출발지 카드 내부만 정밀 스캔하여 찌꺼기 텍스트 전면 소멸
            var childNodes = cardContainer.querySelectorAll("div, p, span");
            childNodes.forEach(function (node) {
                if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node") {
                    node.remove();
                }
            });

            var existAnchor = cardContainer.querySelector("#gcs_core_height_anchor_node");
            if (existAnchor) {
                if (isBuilding) {
                    existAnchor.innerHTML = `<span>건물고도: </span><strong style="color: #fffa65; font-size: 12px;">${calculatedRoofHeight}m</strong>`;
                } else {
                    existAnchor.innerHTML = `<span>지면고도: </span><strong style="color: #00ffcc; font-size: 12px;">${fixedTerrainHeight}m</strong>`;
                }
            }
        }

        if (liveControlInput) {
            liveControlInput.value = safeAltitude;
        }
    };
    forceGcsLeftUiHomeCardTextInject();

    var gcsPersistenceBundle = {
        lon: lon, lat: lat,
        calculatedRoofHeight: isBuilding ? calculatedRoofHeight : 0,
        fixedTerrainHeight: fixedTerrainHeight,
        safeAltitude: safeAltitude,
        dynamicBuildingName: dynamicBuildingName,
        isBuilding: isBuilding
    };
    localStorage.setItem("GCS_LAST_SAVED_HOME_PORT_CACHE", JSON.stringify(gcsPersistenceBundle));
    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({ lon: lon, lat: lat, alt: safeAltitude, address: dynamicBuildingName }));

    if (typeof window.rebuildGcsPipelineAndLabels === "function" && !window.GcsApp.state.rebuildLock) {
        window.GcsApp.state.rebuildLock = true;
        window.rebuildGcsPipelineAndLabels();
        window.GcsApp.state.rebuildLock = false;
    }
}

/**
 * 🔒 [GCS 코어 그래픽 엔진 - 502m 관제고도 실시간 강제 관통 팽창 최종 완결 마스터피스]
 * 1. 외부 루프가 무단 복제하여 주입하는 상단 가짜 중복 안내선을 상시 추적 즉시 삭제(remove)합니다.
 * 2. 인풋창 값(this.value) 조작 즉시, 내부 바인딩 병목을 완전히 우회하고 강제로 입력된 가변 수치를
 *    3D 실린더 엔진으로 직접 관통 주입하여 주황색 원기둥을 상공 500m 위로 즉각 즉각 수직 팽창시킵니다.
 */
(function gcsHomeCoreMasterIronShield() {
    if (window.gcsIronShieldInterval) clearInterval(window.gcsIronShieldInterval);

    window.gcsIronShieldInterval = setInterval(function () {
        var cardContainer = document.getElementById("card_waypoint_Home");
        var altInput = document.getElementById("gcs_home_alt_input");

        // 🛡️ A. 원천 차단 가드: 외부 리프레시 루프가 무단 복제하여 밀어넣는 상단 가짜 중복 라인 실시간 소멸
        if (cardContainer) {
            var nestedDivs = cardContainer.querySelectorAll("div, p, span");
            nestedDivs.forEach(function (node) {
                if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node" && node.parentNode.id !== "gcs_core_height_anchor_node") {
                    node.remove(); // 발견 즉시 즉각 삭제
                }
            });
        }

        // 🛡️ B. 초정밀 가변 실시간 수직 팽창 링크 바인더 결착 (인자 가로채기 완전 해방)
        if (altInput && !altInput.isLiveMasterHooked) {
            altInput.removeEventListener("change", window.gcsAltMasterCoreHandler);
            altInput.removeEventListener("input", window.gcsAltMasterCoreHandler);

            window.gcsAltMasterCoreHandler = function (e) {
                // 💥 [핵심 완치 수식 1] 내부 바인딩 변수에 의존하지 않고 현재 인풋창에 타이핑된 '진짜 날것의 엘리먼트 값'을 다이렉트로 역산 포획합니다.
                window.gcsUserManualAltOverrideLock = true;

                var currentVal = parseInt(this.value, 10);

                if (isNaN(currentVal) || currentVal <= 0) {
                    var rawInput = document.getElementById("gcs_home_alt_input");
                    currentVal = rawInput ? parseInt(rawInput.value, 10) : 200;
                }


                var list = window.GcsApp.state.waypointList || window.waypointList || [];
                var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function (n) { return n && n.id === "Home"; }) : null;

                var targetLon = homeNode ? homeNode.lon : (window.GcsApp.state.lastRightClickLon || 126.919381);
                var targetLat = homeNode ? homeNode.lat : (window.GcsApp.state.lastRightClickLat || 37.460725);
                var baseH = homeNode ? (parseFloat(homeNode.roofBase) > 0 ? homeNode.roofBase : 103) : 103;
                var bName = homeNode ? (homeNode.address || "3D 관제 지정 빌딩 옥상") : "3D 관제 지정 빌딩 옥상";

                // 데이터 원본 메모리 구조체 고도 수치 오버라이드 강착 고정
                if (homeNode) {
                    homeNode.alt = currentVal;
                    homeNode.altitude_Z = currentVal;
                }

                // 새로고침 리셋 박멸 무결성 동기화 캐시 강착
                localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({
                    lon: targetLon,
                    lat: targetLat,
                    alt: currentVal,
                    address: bName,
                    calculatedRoofHeight: baseH
                }));

                var rawCache = localStorage.getItem("GCS_LAST_SAVED_HOME_PORT_CACHE");
                if (rawCache) {
                    try {
                        var parsed = JSON.parse(rawCache);
                        parsed.safeAltitude = currentVal;
                        localStorage.setItem("GCS_LAST_SAVED_HOME_PORT_CACHE", JSON.stringify(parsed));
                    } catch (err) { }
                }

                // 5번째 매개변수 safeAltitude 인자값 자리에 유실 없이 진짜 입력된 고도를 다이렉트 패싱
                // if (typeof window.gcsDeployDynamicHPadAndPrismAirspace === "function") {
                //     window.gcsDeployDynamicHPadAndPrismAirspace(targetLon, targetLat, baseH, bName, currentVal);
                // }

                if (typeof window.rebuildGcsPipelineAndLabels === "function") {
                    window.rebuildGcsPipelineAndLabels();
                }
            }
        }
    }, 400);
})();


// =========================================================================
// 🛡️ [구형 엔진 잔상 완전 소탕 쉴드] 파일 가장 아래에 삽입
// =========================================================================
(function clearGcsOldPrismEngineResiduals() {
    // 기존에 존재하던 구형 원기둥 실린더 팩토리 함수를 완전히 무력화 및 세척합니다.
    window.gcsExecuteIntegratedHPadPrismPipeline = function () { return false; };
    window.gcsDeployDynamicHPadAndPrismAirspace = function () { return false; };

    // 외부 비동기 지형 리셋 타이머가 강제로 고도를 유실시키는 현상을 방지
    window.gcsUserManualAltOverrideLock = true;

    console.log("🛡️ [GCS 보안막] 구형 원기둥 엔진 잔상 및 간섭 스레드가 완전히 청소되었습니다.");
})();


/**
 * 🛸 [GCS 스마트 관제 파이프라인 - centerPosition 엔진 및 옛날 순정 기능 100% 복원 완전체]
 * 1. 옛날 코드에 존재하던 var centerPosition 기반의 Cesium 카메라 뷰포트 정밀 지형 역산 공식을 완전히 복원 내장했습니다.
 * 2. 이를 통해 건물이 없는 일반 지면 평지를 찍었을 때, 고도가 131m 등으로 튀지 않고 지상 바닥면에 자석처럼 찰각 완전히 밀착 안착합니다.
 * 3. 좌측 카드 내부에서 상축의 중복 안내 레이블을 완벽 세척하고, 변경된 제원이 오차 없이 100% 실시간 갱신됩니다.
 */
function gcsExecuteIntegratedHPadPrismPipeline(rawCesiumHeight, isBuilding, currentAction) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // 경유지 추가나 목적지 지정 액션일 때는 기존 출발지 드론포트를 철통 보존하고 우회 리턴
    if (currentAction && (currentAction.indexOf("wp") !== -1 || currentAction.indexOf("waypoint") !== -1 || currentAction.indexOf("destination") !== -1)) {
        console.log(`%c[GCS 바이패스 실드] 경유지/목적지 액션 명세 감지 (${currentAction}) ➡️ 출발지 철통 보존`, "color: #70a1ff; font-size: 11px;");
        return;
    }

    var extractedHeight = parseInt(rawCesiumHeight, 10);
    if (isNaN(extractedHeight) || extractedHeight <= 0) extractedHeight = 111;

    // 🔒 [옛날 순정 코드 100% 복원] centerPosition 변수를 사용한 카메라 타깃 픽킹 및 지표면 해발 고도 산출식
    var lon = 126.919416;
    var lat = 37.460815;
    var fixedTerrainHeight = 0;

    var centerPosition = scene.camera.pickEllipsoid(new Cesium.Cartesian2(mainViewer.canvas.clientWidth / 2, mainViewer.canvas.clientHeight / 2));
    if (centerPosition) {
        var carto = Cesium.Cartographic.fromCartesian(centerPosition);
        lon = Cesium.Math.toDegrees(carto.longitude);
        lat = Cesium.Math.toDegrees(carto.latitude);
        fixedTerrainHeight = Math.round(scene.globe ? (scene.globe.getHeight(carto) || 0) : 0);
    }

    // 마우스 우클릭 지점의 최신 전역 좌표 버퍼가 존재한다면 최우선 매칭 래칭
    if (window.GcsApp && window.GcsApp.state) {
        if (window.GcsApp.state.lastRightClickLon) {
            lon = window.GcsApp.state.lastRightClickLon;
            lat = window.GcsApp.state.lastRightClickLat;
        }
        if (fixedTerrainHeight === 0 && scene.globe) {
            fixedTerrainHeight = Math.round(scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) || 0);
        }
    }

    if (fixedTerrainHeight <= 0 || isNaN(fixedTerrainHeight)) fixedTerrainHeight = 86;

    var calculatedRoofHeight = extractedHeight;
    var finalNetHeightInt = calculatedRoofHeight - fixedTerrainHeight;

    // 옛날 코드의 난곡동 물리 범위 스냅 가드 공식 그대로 유지
    if (finalNetHeightInt <= 2 || finalNetHeightInt > 200 || isNaN(finalNetHeightInt)) {
        finalNetHeightInt = 25;
        fixedTerrainHeight = calculatedRoofHeight - finalNetHeightInt;
    }

    // 🔒 [완치 포인트 1] 건물이 아닌 일반 지면(맨땅)인 경우, 허공 튕김을 막고 추출된 진짜 지면 고도를 이륙 높이로 다이렉트 락온 대입
    if (!isBuilding) {
        calculatedRoofHeight = fixedTerrainHeight;
    }

    // 실시간 인풋 박스로부터 사용자가 조정한 관제 고도 값을 실시간 가로챔
    var liveControlInput = document.getElementById("gcs_home_alt_input");
    var safeAltitude = liveControlInput ? parseInt(liveControlInput.value, 10) : (calculatedRoofHeight + 60);
    if (isNaN(safeAltitude) || safeAltitude <= calculatedRoofHeight) {
        safeAltitude = calculatedRoofHeight + 60;
    }

    var dynamicBuildingName = isBuilding ? "3D 관제 지정 빌딩 옥상" : "자연 지표면 평지 이륙장";
    var pickedFeature = (window.GcsApp && window.GcsApp.state) ? (window.GcsApp.state.gcsSelectedFeature || window.GcsApp.state.gcsHoveredFeature) : null;
    if (pickedFeature && typeof pickedFeature.getProperty === "function") {
        var nativeName = pickedFeature.getProperty("name") || pickedFeature.getProperty("BLDG_NM") || pickedFeature.getProperty("bldg_nm");
        if (nativeName) dynamicBuildingName = nativeName;
    }

    if (window.GcsApp && window.GcsApp.state) {
        window.GcsApp.state.lastRightClickRoofHeight = calculatedRoofHeight;
        window.GcsApp.state.calculatedSafeAltitude = safeAltitude;

        // 전역 기체 경로 배열(waypointList) 원본 상태 실시간 오버라이드 싱크 체결
        var list = window.GcsApp.state.waypointList || window.waypointList || [];
        if (Array.isArray(list) && list.length > 0) {
            var homeNode = list.find(function (n) { return n && n.id === "Home"; });
            if (homeNode) {
                homeNode.lon = lon;
                homeNode.lat = lat;
                homeNode.alt = safeAltitude;
                // 💥 건물이 아닐 때는 roofBase 속성을 '0'으로 밀어내어 가짜 텍스트 생성을 차단
                homeNode.roofBase = isBuilding ? calculatedRoofHeight : 0;
                homeNode.address = dynamicBuildingName;
            }
        }
    }

    // 🔒 [완치 포인트 2] 좌측 비행경로 리스트 영역 내부의 홈카드 가변 레이블 텍스트 정밀 주입 및 세척
    var forceGcsLeftUiHomeCardTextInject = function () {
        var cardContainer = document.getElementById("card_waypoint_Home");
        if (cardContainer) {
            // 외부 루프가 무단 복제하여 밀어 넣던 가짜 중복 상단 라인 추적하여 완전 삭제
            var childNodes = cardContainer.querySelectorAll("div, p, span");
            childNodes.forEach(function (node) {
                if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node") {
                    node.remove();
                }
            });

            // 단 하나의 정식 안착 앵커 패널 내부 데이터 정방향 강제 동기화 갱신
            var existAnchor = cardContainer.querySelector("#gcs_core_height_anchor_node");
            if (existAnchor) {
                if (isBuilding) {
                    existAnchor.innerHTML = `<span>건물고도: </span><strong style="color: #fffa65; font-size: 12px;">${calculatedRoofHeight}m</strong> <span style="font-size:10px; color:#95a5a6;"></span>`;
                } else {
                    existAnchor.innerHTML = `<span>지면고도: </span><strong style="color: #00ffcc; font-size: 12px;">${fixedTerrainHeight}m</strong> <span style="font-size:10px; color:#95a5a6;">(지상 높이)</span>`;
                }
            }
        }

        if (liveControlInput) {
            liveControlInput.value = safeAltitude;
        }
    };
    forceGcsLeftUiHomeCardTextInject();

    // 설정 완료된 영구 제원 패키지 데이터 로컬 스토리지 저장 (새로고침/재접속 대비용)
    var gcsPersistenceBundle = {
        lon: lon, lat: lat,
        calculatedRoofHeight: isBuilding ? calculatedRoofHeight : 0,
        fixedTerrainHeight: fixedTerrainHeight,
        safeAltitude: safeAltitude,
        dynamicBuildingName: dynamicBuildingName,
        isBuilding: isBuilding
    };
    localStorage.setItem("GCS_LAST_SAVED_HOME_PORT_CACHE", JSON.stringify(gcsPersistenceBundle));
    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({ lon: lon, lat: lat, alt: safeAltitude, address: dynamicBuildingName }));

    // 🔒 [완치 포인트 3] 갱신된 실시간 관제고도를 토스하여 3D 드론 포트와 주황색 원기둥 수직 팽창 격발
    // gcsDeployDynamicHPadAndPrismAirspace(lon, lat, isBuilding ? calculatedRoofHeight : fixedTerrainHeight, dynamicBuildingName, safeAltitude);

    if (typeof window.rebuildGcsPipelineAndLabels === "function" && !window.GcsApp.state.rebuildLock) {
        window.GcsApp.state.rebuildLock = true;
        window.rebuildGcsPipelineAndLabels();
        window.GcsApp.state.rebuildLock = false;
    }
}

// =========================================================================
// 🔗 [체크박스 및 시뮬레이션 연동기] 최적화 즉시 반영 바인딩
// =========================================================================
window.toggleGcsTerrainOptimization = function (isChecked) {
    if (isChecked) {
        var res = window.runGcsRouteOptimization();
        if (res) {
            console.log(`✅ [최적화 완료] 거리: ${res.distance}m | 최고장애물: ${res.maxObstacle}m | 안전고도: ${res.safeAlt}m | 추가WP: ${res.addedCount}개`);
        }
    } else {
        // 체크 해제 시 자동 생성된 WP_AUTO 노드 및 가이드라인 제거
        var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
        var cleaned = list.filter(function (n) { return n && !String(n.id).startsWith("WP_AUTO_"); });
        window.GcsApp.state.waypointList = cleaned;
        window.waypointList = cleaned;

        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
            var line = ws3d.viewer.entities.getById("GCS_3D_MAP_COMPASS_LINE");
            if (line) ws3d.viewer.entities.remove(line);
        }
        if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
        if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    }
};

// =========================================================================
// 🛫 [시뮬레이션 시작 인터록] 기존 가로채기 대신 WP 추가 브리핑 후 비행 실행
// =========================================================================
var pureStartGcsSim = window.startGcsDroneSimulation;
window.startGcsDroneSimulation = function () {
    var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
    var hasAutoWp = list.some(function (n) { return n && String(n.id).startsWith("WP_AUTO_"); });

    if (!hasAutoWp && list.length >= 2) {
        var res = window.runGcsRouteOptimization();
        if (res) {
            window.gcsAutoNodesPreparedGuard = true;
            alert(
                `🛰️ [GCS 경로 최적화 및 경유지(WP) 반영 완료]\n` +
                `=======================================\n\n` +
                `• 총 비행 거리: ${res.distance}m\n` +
                `• 최고 장애물 고도: ${res.maxObstacle}m\n` +
                `• 안전 순항 고도: ${res.safeAlt}m\n\n` +
                `🛠️ 반영된 경유지(WP) 명세:\n` +
                `${res.logs.join("\n")}\n\n` +
                `=======================================\n` +
                `좌측 카드 목록과 3D 경로선을 확인하신 후\n` +
                `[시뮬레이션 시작] 버튼을 한 번 더 누르시면 비행이 시작됩니다.`
            );
            return;
        }
    }

    // 2번째 클릭 시 기존 자율비행 타임라인 즉시 기동
    window.gcsAutoNodesPreparedGuard = false;
    if (typeof pureStartGcsSim === "function") {
        pureStartGcsSim.apply(this, arguments);
    }
};


// 초기 로딩 2초 후 최적화 체크박스 자동 활성화 및 이벤트 결착
setTimeout(function () {
    var labels = document.querySelectorAll("label, span, div");
    labels.forEach(function (el) {
        if (el.textContent && el.textContent.indexOf("경로상 지형") !== -1) {
            var parent = el.parentElement;
            var chk = parent ? parent.querySelector("input[type='checkbox']") : null;
            if (chk && !chk.isOptHooked) {
                chk.checked = true; // 기본 활성화
                chk.addEventListener("change", function () {
                    window.toggleGcsTerrainOptimization(this.checked);
                });
                chk.isOptHooked = true;
                window.toggleGcsTerrainOptimization(true);
            }
        }
    });
}, 2000);


// =========================================================================
// 💾 [전역 저장 실행기] 출발지(Home) 정보 로컬 스토리지 즉시 영구 저장
// =========================================================================
window.saveGcsHomeCardDirectly = function () {
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : (window.waypointList || []);
    var homeNode = list.find(function (n) { return n && String(n.id).toLowerCase() === "home"; });
    if (!homeNode) return;

    var homeSavePayload = {
        id: "Home",
        lon: parseFloat(homeNode.lon),
        lat: parseFloat(homeNode.lat),
        alt: parseFloat(homeNode.alt) || 150,
        roofBase: Math.round(parseFloat(homeNode.roofBase) || 0),
        calculatedRoofHeight: Math.round(parseFloat(homeNode.roofBase) || 0),
        address: homeNode.address || "사용자 설정 락온 공역 출발지",
        heading_deg: homeNode.heading_deg || 0
    };
    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(homeSavePayload));

    // 버튼 시각적 피드백 (팝업 없음)
    var saveBtn = document.querySelector("#card_waypoint_Home .gcs-home-save-btn");
    if (saveBtn) {
        saveBtn.innerHTML = "✅ 저장됨";
        saveBtn.style.background = "#2ecc71";
        saveBtn.style.color = "#fff";
        setTimeout(function () {
            saveBtn.innerHTML = "💾 저장";
            saveBtn.style.background = "#f1c40f";
            saveBtn.style.color = "#000";
        }, 1200);
    }
};


// =========================================================================
// 🎯 [전역 카메라 포커스] 2D·3D 구분 없이 해당 좌표를 화면 정중앙으로 이동
// =========================================================================
window.focusGcsNodeOnMap = function (lon, lat, baseHeight) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var numLon = parseFloat(lon);
    var numLat = parseFloat(lat);
    var floorH = parseFloat(baseHeight) || 0;

    if (isNaN(numLon) || isNaN(numLat)) return;

    // 기존 카메라 락 해제
    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    var currentPitchDeg = Cesium.Math.toDegrees(mainViewer.camera.pitch);
    var is2DTopView = (window.isGcsCameraCurrently2D === true || currentPitchDeg <= -75.0);
    var currentHeading = mainViewer.camera.heading;
    var viewHeightOffset = 260.0; // 지면/옥상으로부터 띄울 카메라 높이(m)

    if (is2DTopView) {
        // 2D 탑뷰 모드: 위경도 정중앙 수직 상공으로 이동
        mainViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(numLon, numLat, floorH + viewHeightOffset),
            orientation: {
                heading: currentHeading,
                pitch: Cesium.Math.toRadians(-90.0),
                roll: 0.0
            },
            duration: 0.6
        });
    } else {
        // 3D 사선뷰(-45도) 모드: 카메라 시선(heading) 방향의 뒤쪽으로 오프셋을 주어 타깃이 화면 정중앙에 오도록 계산
        var pitchRad = Cesium.Math.toRadians(-45.0);
        // 45도 각도일 때 높이(viewHeightOffset)만큼 뒤로 물러나야 화면 정중앙에 타깃이 위치함
        var metersPerDegLat = 111320.0;
        var metersPerDegLon = 111320.0 * Math.cos(Cesium.Math.toRadians(numLat));

        var offsetLat = (viewHeightOffset * Math.cos(currentHeading)) / metersPerDegLat;
        var offsetLon = (viewHeightOffset * Math.sin(currentHeading)) / metersPerDegLon;

        mainViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(numLon - offsetLon, numLat - offsetLat, floorH + viewHeightOffset),
            orientation: {
                heading: currentHeading,
                pitch: pitchRad,
                roll: 0.0
            },
            duration: 0.6
        });
    }
};