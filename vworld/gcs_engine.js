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

    
    // 현재 지도를 바라보는 화면 12시 방향(카메라 시선) 진북 기준 각도(0°~359°) 캡처
    var currentScreenHeadingDeg = 0;
    if (mainViewer && mainViewer.camera) {
        currentScreenHeadingDeg = Math.round(Cesium.Math.toDegrees(mainViewer.camera.heading)) % 360;
        if (currentScreenHeadingDeg < 0) currentScreenHeadingDeg += 360;
    }

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
    
    // ✅ [수정] 실제 사용되는 아래쪽 nodeData 객체에 방위각 속성 2줄 추가
    var nodeData = {
        id: targetNodeId,
        lon: numLon,
        lat: numLat,
        alt: computedCameraDesignAlt,
        roofBase: roofBaseHeightToSave,
        address: dynamicBuildingName,
        isBuilding: isActuallyBuilding,
        heading_deg: currentScreenHeadingDeg,                      // ◀ 추가
        heading_H: Cesium.Math.toRadians(currentScreenHeadingDeg)  // ◀ 추가
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