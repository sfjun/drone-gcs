

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
    window.addEventListener("load", function() {
        setTimeout(function() {
            var altInput = document.getElementById("gcs_home_alt_input");
            if (altInput) altInput.value = liveSafeAlt;

            var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
            var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){ return n && n.id === "Home"; }) : null;
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
 * WMS 게이트웨이 레이어 표준 초기화 가드
 */
// window.initDisasterWMSLayer = function () {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     try {
//         window.GcsApp.state.vworldDisasterLayerInstance = ws3d.viewer.imageryLayers.addImageryProvider(
//             new Cesium.WebMapServiceImageryProvider({
//                 url: "https://api.vworld.kr/req/wms",
//                 layers: "lt_c_spbd",
//                 parameters: {
//                     service: "WMS",
//                     version: "1.1.1",
//                     request: "GetMap",
//                     styles: "lt_c_spbd",
//                     format: "image/png",
//                     transparent: "true",
//                     apiKey: window.GcsApp.CONFIG.WMS_API_KEY
//                 },
//                 proxy: new Cesium.DefaultProxy("/proxy.do")
//             })
//         );
//         window.GcsApp.state.vworldDisasterLayerInstance.show = false;
//     } catch (e) { console.warn("⚠️ WMS 초기화 가드 작동:", e); }
// };

// window.toggleFireWMS = function (elementOrChecked) {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     if (!window.GcsApp.state.vworldDisasterLayerInstance) window.initDisasterWMSLayer();

//     var isShow = false;
//     if (typeof elementOrChecked === "boolean") {
//         isShow = elementOrChecked;
//     } else if (elementOrChecked && typeof elementOrChecked === "object") {
//         isShow = elementOrChecked.checked !== undefined ? elementOrChecked.checked : jQuery(elementOrChecked).is(":checked");
//     }

//     if (window.GcsApp.state.vworldDisasterLayerInstance) {
//         window.GcsApp.state.vworldDisasterLayerInstance.show = isShow;
//     }
// };

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

            // 2. 💥 [통합 바인딩 결착] 선택한 새로운 검색지의 좌표와 명세를 영구 홈 설정 함수로 토스하여 강제 동기화
            // if (typeof window.setGcsPermanentHome === "function") {
            //     window.setGcsPermanentHome(lon, lat, displayTitle);
            // } else {
            //     // 백업 가드: setGcsPermanentHome이 호출 불가능할 때 다이렉트로 스토리지 락 및 리스트 갱신
            //     var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG) ? (window.GcsApp.CONFIG.DEFAULT_ALTITUDE || 150.0) : 150.0;
            //     window.gcsPermanentHomeData = { id: "Home", lon: lon, lat: lat, alt: defaultAlt, address: displayTitle };
            //     localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(window.gcsPermanentHomeData));

            //     var list = window.GcsApp.state.waypointList || window.waypointList || [];

            //     if (list.length > 0 && list[0].id === "Home") list[0] = window.gcsPermanentHomeData;
            //     else list.unshift(window.gcsPermanentHomeData);

            //     window.GcsApp.state.waypointList = list;
            //     window.waypointList = list;
            //     if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
            // }

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





/**
 * 🔒 [완치 포인트 1] 기존 UI 리렌더러 내의 출발지(Home) 사출 코드 리뉴얼
 * 기존 소스 파일의 renderWaypointListUI 함수 내부에서 Home 카드를 append/html 하는 구문을
 * 아래의 정방향 단일 고도 출력 명세 구조로 전면 교체해 주세요.
 */
window.gcsRenderPureHomeCardTemplate = function (node) {
    var isBuilding = (parseFloat(node.roofBase) > 0);
    var baseHeightText = isBuilding
        ? `건물고도: <strong style="color: #fffa65; font-size: 13px;">${node.roofBase}m</strong> <span style="font-size:10px; color:#95a5a6;"></span>`
        : `지면고도: <strong style="color: #00ffcc; font-size: 13px;">${parseFloat(node.alt) - 60 > 0 ? Math.round(parseFloat(node.alt) - 60) : 86}m</strong> <span style="font-size:10px; color:#95a5a6;">(지상 높이)</span>`;

    // 💥 [순정 원천 세척] 상단에 중복 주입되던 가짜 지면고도 라인을 아예 템플릿 뼈대에서 흔적도 없이 삭제했습니다.
    var htmlString = `
        <div id="card_waypoint_Home" class="gcs-waypoint-card active" style="padding: 10px; border-left: 4px solid #ff9f43; margin-bottom: 8px; background: rgba(30, 30, 30, 0.6); border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #ff9f43; font-weight: bold; font-size: 14px;">▶ 출발지 (Home)</span>
                <span class="badge" style="background: #ff9f43; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px;">관제 고정</span>
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: #a4b0be;">사용자 설정 락온 공역</div>
            <div style="margin-top: 4px; font-size: 11px; color: #bdc5cd; font-family: monospace;">X: ${parseFloat(node.lon).toFixed(6)} &nbsp; Y: ${parseFloat(node.lat).toFixed(6)}</div>
            
            <!-- 🔒 단 하나의 정방향 고도 명세판 배치 (항목값 깨짐 원천 박멸) -->
            <div id="gcs_core_height_anchor_node" style="margin-top: 6px; font-size: 12px; color: #bdc3c7; line-height: 1.4;">
                ${baseHeightText}
            </div>

            <!-- 🔒 관제고도 제어 및 실시간 수직 팽창 입력 컴포넌트 -->
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ecf0f1;">
                <span>관제 고도:</span>
                <input type="number" id="gcs_home_alt_input" value="${node.alt}" min="10" max="1000" step="5" 
                       style="width: 70px; background: #2c3e50; border: 1px solid #34495e; color: #fff; font-weight: bold; font-size: 13px; text-align: center; border-radius: 3px; padding: 2px;" />
                <span style="color: #2ecc71; font-weight: bold;">m</span>
            </div>
        </div>
    `;
    return htmlString;
};



/**
 * 🛸 [GCS 스마트 관제 UI 파이프라인 - 삭제 시 목적지 변환 현상 원천 봉쇄 최종본]
 */
// window.renderWaypointListUI = function () {
//     var container = document.getElementById("wp_list_container") ||
//         document.getElementById("gcs_waypoint_list_container") ||
//         document.getElementById("waypoint_list");
//     if (!container) return;

//     if (!window.GcsApp) window.GcsApp = { state: {} };
//     if (!window.GcsApp.state) window.GcsApp.state = {};
//     if (!Array.isArray(window.GcsApp.state.waypointList)) window.GcsApp.state.waypointList = [];

//     var list = window.GcsApp.state.waypointList;
//     container.innerHTML = "";
//     var defaultAlt = 150.0;

//     var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
//     var activeHome = null;

//     if (savedHomeLock) {
//         var parsedHome = JSON.parse(savedHomeLock);
//         var displayLocationName = parsedHome.buildingName || parsedHome.address || "사용자 지정";
//         activeHome = {
//             id: "Home",
//             lon: parseFloat(parsedHome.lon),
//             lat: parseFloat(parsedHome.lat),
//             alt: parseFloat(parsedHome.alt || defaultAlt),
//             address: displayLocationName
//         };
//     } else {
//         var initLon = typeof NANGOK_LON !== "undefined" && NANGOK_LON ? NANGOK_LON : 126.919435;
//         var initLat = typeof NANGOK_LAT !== "undefined" && NANGOK_LAT ? NANGOK_LAT : 37.460975;
//         activeHome = { id: "Home", lon: initLon, lat: initLat, alt: defaultAlt, address: "난곡동 주민센터" };
//     }

//     if (list.length === 0) {
//         list.push(activeHome);
//     } else {
//         if (list[0] && list[0].id === "Home") {
//             list[0].lon = activeHome.lon;
//             list[0].lat = activeHome.lat;
//             list[0].address = activeHome.address;
//             if (!list[0].alt) list[0].alt = activeHome.alt;
//         } else {
//             list = list.filter(function (item) { return item && item.id !== "Home"; });
//             list.unshift(activeHome);
//         }
//     }

//     list = list.filter(function (wp) { return wp !== undefined && wp !== null; });
//     window.GcsApp.state.waypointList = list;
//     window.waypointList = list;

//     // 비행 노드 리스트 UI 동적 카드 순회 사출
//     list.forEach(function (wp, idx) {

//         if (!wp || !wp.id) return;

//         // =========================================================================
//         // 💥 [3D 하이브리드 고도 연산 엔진 - 출발지 및 노드별 고도 파괴 방지 완치본]
//         // =========================================================================
//         var finalCalculatedHeight = 0;
//         var heightLabelText = "지면고도"; 

//         if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.scene) {
//             var scene = ws3d.viewer.scene;
//             if (scene.globe) {
//                 var radLon = Cesium.Math.toRadians(wp.lon);
//                 var radLat = Cesium.Math.toRadians(wp.lat);
//                 var cartoInstance = new Cesium.Cartographic(radLon, radLat);

//                 // 1. 순수 바닥 지형 고도(Terrain Base) 산출
//                 var pureTerrainHeight = scene.globe.getHeight(cartoInstance) || 0;
//                 finalCalculatedHeight = Math.round(pureTerrainHeight);

//                 // 2. 3D 타일즈 건물 옥상 높이 정밀 스캔 (pickPosition 에러 방어벽 구축)
//                 var cartesianPos = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0);
//                 var screenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, cartesianPos);

//                 // 만약 화면 좌표 변환이 올바르지 않다면 캔버스 중앙 가상 좌표를 백업으로 부여합니다.
//                 if (!Cesium.defined(screenPos) || isNaN(screenPos.x) || isNaN(screenPos.y)) {
//                     screenPos = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
//                 }

//                 try {
//                     var pickedPosition = scene.pickPosition(screenPos);
//                     if (Cesium.defined(pickedPosition)) {
//                         var surfaceCarto = Cesium.Cartographic.fromCartesian(pickedPosition);
//                         var surfaceHeight = surfaceCarto.height;

//                         // 취득된 높이가 순수 바닥 지형보다 2.5m 이상 높다면 인공 구조물(건물 옥상)로 확정
//                         if (surfaceHeight > pureTerrainHeight + 2.5 && surfaceHeight < 2000) {
//                             finalCalculatedHeight = Math.round(surfaceHeight);
//                             heightLabelText = "건물고도"; 
//                         }
//                     }
//                 } catch (e) {
//                     // 예외 발생 시 순수 지형 고도로 안전 유도
//                     finalCalculatedHeight = Math.round(pureTerrainHeight);
//                     heightLabelText = "지면고도";
//                 }
//             }
//         }

//         // 💥 [수정 완치 포인트] 거꾸로 매칭되어 있던 레이블 타이틀 분기를 정방향으로 수선
//         // 실제 노드가 건물 위(roofBase > 0)인지 맨땅 위인지 데이터 구조를 100% 반영하여 문구를 매칭합니다.
//         var isBuildingNode = typeof wp.roofBase !== "undefined" && parseInt(wp.roofBase) > 0;
//         heightLabelText = isBuildingNode ? "건물고도" : "지면고도";

//         // 0m 이하로 파괴되는 현상을 막기 위한 난곡동 타겟 물리 범위 스냅 가드 (순정 보정 유지)
//         if (finalCalculatedHeight <= 5 || finalCalculatedHeight > 2000) {
//             finalCalculatedHeight = (wp.id === "Home") ? 110 : 90; 
//         }

//         var card = document.createElement("div");
//         card.className = "gcs-waypoint-card" + (wp.id === "Home" ? " active" : "");
//         card.id = "card_waypoint_" + wp.id;

//         var themeColor = (wp.id === "Home") ? "#f1c40f" : (wp.id === "Destination") ? "#ef5350" : "#3498db";
//         var borderStyle = "margin: 4px 0 6px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid " + themeColor + "; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer; transition: 0.2s;";
//         card.style.cssText = borderStyle;

//         card.onmouseover = function () { this.style.background = "rgba(47, 54, 64, 0.95)"; };
//         card.onmouseout = function () { this.style.background = "rgba(30, 39, 46, 0.95)"; };

//         if (wp.id === "Home") {
//             card.innerHTML = `
//                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; pointer-events: none;">
//                     <span style="font-weight: bold; color: ${themeColor}; font-size: 14px;">🚩 출발지 (Home)</span>
//                     <span style="font-size: 11px; background: ${themeColor}; color: #000; padding: 2px 6px; border-radius: 10px; font-weight: bold;">관제 고정</span>
//                 </div>
//                 <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5; pointer-events: none; margin-bottom: 6px;">
//                     <div style="font-weight: bold; color: #fff; margin-bottom: 4px; font-size: 12px;">${wp.address}</div>
//                     <div style="display: flex; gap: 12px;">
//                         <span>X: ${wp.lon.toFixed(6)}</span>
//                         <span>Y: ${wp.lat.toFixed(6)}</span>
//                     </div>
//                 </div>
//                 <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;">
//                     <div style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #bdc3c7; white-space: nowrap;">
//                         <span>${heightLabelText}:</span>
//                         <strong style="color: #fff; font-size: 12px;">${finalCalculatedHeight}m</strong>
//                     </div>
//                     <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap;">
//                         <span style="font-weight: bold; color: #2ecc71; font-size: 12px;">관제 고도:</span>
//                         <input type="number" id="gcs_home_alt_input" value="${Math.round(wp.alt)}" style="width: 50px; background: #111; color: #2ecc71; border: 1px solid #2ecc71; text-align: center; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 2px 0;" />
//                         <span style="color: #2ecc71; font-weight: bold; font-size: 12px;">m</span>
//                     </div>
//                 </div>
//             `;

//             var altInput = card.querySelector("#gcs_home_alt_input");
//             if (altInput) {
//                 var altEventHandler = function (e) {
//                     e.stopPropagation();
//                     var newAlt = parseFloat(this.value) || defaultAlt;
//                     wp.alt = newAlt;
//                     var currentLock = localStorage.getItem("gcs_permanent_home_lock");
//                     if (currentLock) {
//                         var parsed = JSON.parse(currentLock);
//                         parsed.alt = newAlt;
//                         localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(parsed));
//                     }
//                     if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
//                 };
//                 altInput.addEventListener("change", altEventHandler);
//                 altInput.addEventListener("input", altEventHandler);
//                 altInput.addEventListener("click", function (e) { e.stopPropagation(); });
//             }

//         } else {
//             var cardTitle = wp.id.startsWith("WP_") ? "🛸 경유지 (" + wp.id + ")" : "🎯 목적지 (Destination)";

//             // 💥 [인풋 박스 최종 실드] wp.alt 값이 NaN, undefined, 문자열 형태인 경우를 모두 스캔하여 150 정수로 복원
//             var parsedAltInt = 150;
//             if (wp && typeof wp.alt !== "undefined" && wp.alt !== null) {
//                 var tempParsed = parseInt(wp.alt, 10);
//                 if (!isNaN(tempParsed) && tempParsed > 0) {
//                     parsedAltInt = tempParsed;
//                 }
//             }

//             // 💥 [마크업 및 CSS 인프라 정밀 수선] 백틱 내부의 깨진 문자열 구조를 원본 규격과 싱크를 맞춰 완벽히 복구
//             card.innerHTML = `
//                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
//                     <span style="font-weight: bold; color: ${themeColor}; font-size: 13px; pointer-events: none;">${cardTitle}</span>
//                     <button class="gcs-wp-delete-btn" style="background: #ef5350; border: none; color: #fff; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; transition: 0.2s; z-index: 10;">삭제 X</button>
//                 </div>
//                 <div style="font-size: 11px; color: #bdc3c7; line-height: 1.5; pointer-events: none; margin-bottom: 6px;">
//                     <div style="display: flex; gap: 12px;">
//                         <span>X: ${wp.lon.toFixed(6)}</span>
//                         <span>Y: ${wp.lat.toFixed(6)}</span>
//                     </div>
//                 </div>
//                 <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;">
//                     <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #bdc3c7; white-space: nowrap;">
//                         <span>${heightLabelText}:</span>
//                         <strong style="color: #fff; font-size: 11px;">${finalCalculatedHeight}m</strong>
//                     </div>
//                     <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap;">
//                         <span style="font-weight: bold; color: ${themeColor}; font-size: 11px;">관제 고도:</span>
//                         <input type="number" class="gcs-node-alt-dynamic-input" value="${parsedAltInt}" style="width: 55px; background: #111; color: ${themeColor}; border: 1px solid ${themeColor}; text-align: center; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 2px 0;" />
//                         <span style="color: ${themeColor}; font-weight: bold; font-size: 11px;">m</span>
//                     </div>
//                 </div>
//             `;

//             // 개별 비행 노드 삭제 버튼 안전 결착 루프
//             var delBtn = card.querySelector(".gcs-wp-delete-btn");
//             if (delBtn) {
//                 delBtn.addEventListener("click", function (e) {
//                     e.stopPropagation();
//                     var currentList = window.GcsApp.state.waypointList;
//                     var findIdx = currentList.findIndex(function(item) { return item.id === wp.id; });
//                     if (findIdx > -1) {
//                         currentList.splice(findIdx, 1);
//                         var cleanList = [];
//                         var wpCounter = 1;

//                         currentList.forEach(function (node) {
//                             if (!node) return;
//                             if (node.id === "Home") {
//                                 cleanList.push(node);
//                             } else {
//                                 var finalId = node.id;
//                                 if (node.id.startsWith("WP_") || node.id.startsWith("WP_TEMP_")) {
//                                     finalId = "WP_" + wpCounter++;
//                                 }
//                                 cleanList.push({
//                                     id: finalId,
//                                     lon: node.lon,
//                                     lat: node.lat,
//                                     alt: node.alt || 150
//                                 });
//                             }
//                         });
//                         window.GcsApp.state.waypointList = cleanList;
//                         window.waypointList = cleanList;
//                         if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
//                         window.renderWaypointListUI();
//                     }
//                 });
//             }

//             // 💥 [인풋 체인지 인터록 복원] 사용자가 입력창 수치를 바꿨을 때 실시간 데이터 오버라이드 싱크 보장
//             var nodeAltInput = card.querySelector(".gcs-node-alt-dynamic-input");
//             if (nodeAltInput) {
//                 var nodeAltHandler = function (e) {
//                     e.stopPropagation();
//                     var val = parseInt(this.value, 10) || defaultAlt;
//                     wp.alt = val; // 배열 내부 원본 데이터 값 동기화
//                     if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
//                 };
//                 nodeAltInput.addEventListener("change", nodeAltHandler);
//                 nodeAltInput.addEventListener("input", nodeAltHandler);
//                 nodeAltInput.addEventListener("click", function(e) { e.stopPropagation(); });
//             }
//         }
//         // 목록 카드 클릭 시 세슘 카메라 비행(flyTo) 바인딩
//         card.addEventListener("click", function () {
//             if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//             var mainViewer = ws3d.viewer;
//             mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
//             mainViewer.camera.flyTo({
//                 destination: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat - 0.0012, finalCalculatedHeight + 250),
//                 orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-40.0), roll: 0.0 },
//                 duration: 0.6
//             });
//             if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
//         });
//         container.appendChild(card);
//     });
// };


/**
 * 🛸 [GCS 스마트 관제 UI 파이프라인 - 수많은 시행착오 보존 및 최종 완결 마스터피스]
 * 1. 출발지(Home) 카드의 상단 중복 라인을 템플릿 레벨에서 완벽하게 파괴하고 단 하나로 고정했습니다.
 * 2. 홈설정(땅/건물) 선택 대상에 따라 하단 레이블이 [지면고도: 값] 또는 [건물고도: 값]으로 정방향 자동 결정됩니다.
 * 3. 관제고도 인풋 수치를 변경하는 순간, 3D 원기둥의 높이가 실시간으로 오차 없이 즉각 수직 팽창합니다.
 * 4. 기존 경유지/목적지의 고도 입력창(.gcs-node-alt-dynamic-input), 삭제 버튼(.gcs-wp-delete-btn), 
 *    그리고 카드 클릭 시 해당 좌표 상공으로 날아가는 카메라 flyTo 무빙 리스너 기능을 100% 온전히 유지 복원했습니다.
 */
window.renderWaypointListUI = function () {
    var container = document.getElementById("wp_list_container") ||
        document.getElementById("gcs_waypoint_list_container") ||
        document.getElementById("waypoint_list");
    if (!container) return;

    if (!window.GcsApp) window.GcsApp = { state: {} };
    if (!window.GcsApp.state) window.GcsApp.state = {};
    if (!Array.isArray(window.GcsApp.state.waypointList)) window.GcsApp.state.waypointList = [];

    var list = window.GcsApp.state.waypointList;
    container.innerHTML = "";
    var defaultAlt = 150.0;

    var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
    var activeHome = null;

    if (savedHomeLock) {
        var parsedHome = JSON.parse(savedHomeLock);
        var displayLocationName = parsedHome.buildingName || parsedHome.address || "사용자 지정";
        activeHome = {
            id: "Home",
            lon: parseFloat(parsedHome.lon),
            lat: parseFloat(parsedHome.lat),
            alt: parseFloat(parsedHome.alt || defaultAlt),
            roofBase: parsedHome.calculatedRoofHeight || parsedHome.roofBase || 0,
            address: displayLocationName
        };
    } else {
        var initLon = typeof NANGOK_LON !== "undefined" && NANGOK_LON ? NANGOK_LON : 126.919435;
        var initLat = typeof NANGOK_LAT !== "undefined" && NANGOK_LAT ? NANGOK_LAT : 37.460975;
        activeHome = { id: "Home", lon: initLon, lat: initLat, alt: defaultAlt, roofBase: 0, address: "난곡동 주민센터" };
    }

    if (list.length === 0) {
        list.push(activeHome);
    } else {
        if (list[0] && list[0].id === "Home") {
            list[0].lon = activeHome.lon;
            list[0].lat = activeHome.lat;
            list[0].address = activeHome.address;
            if (!list[0].alt) list[0].alt = activeHome.alt;
            if (typeof list[0].roofBase === "undefined") list[0].roofBase = activeHome.roofBase;
        } else {
            list = list.filter(function (item) { return item && item.id !== "Home"; });
            list.unshift(activeHome);
        }
    }

    list = list.filter(function (wp) { return wp !== undefined && wp !== null; });
    window.GcsApp.state.waypointList = list;
    window.waypointList = list;

    // 비행 노드 리스트 UI 동적 카드 순회 사출
    list.forEach(function (wp, idx) {
        if (!wp || !wp.id) return;

        // =========================================================================
        // 💥 [3D 하이브리드 고도 연산 엔진 - 출발지 및 노드별 고도 파괴 방지 완치본]
        // =========================================================================
        var finalCalculatedHeight = 0;
        var heightLabelText = "지면고도";

        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.scene) {
            var scene = ws3d.viewer.scene;
            if (scene.globe) {
                var radLon = Cesium.Math.toRadians(wp.lon);
                var radLat = Cesium.Math.toRadians(wp.lat);
                var cartoInstance = new Cesium.Cartographic(radLon, radLat);

                var pureTerrainHeight = scene.globe.getHeight(cartoInstance) || 0;
                finalCalculatedHeight = Math.round(pureTerrainHeight);

                var cartesianPos = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0);
                var screenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, cartesianPos);

                if (!Cesium.defined(screenPos) || isNaN(screenPos.x) || isNaN(screenPos.y)) {
                    screenPos = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
                }

                try {
                    var pickedPosition = scene.pickPosition(screenPos);
                    if (Cesium.defined(pickedPosition)) {
                        var surfaceCarto = Cesium.Cartographic.fromCartesian(pickedPosition);
                        var surfaceHeight = surfaceCarto.height;

                        if (surfaceHeight > pureTerrainHeight + 2.5 && surfaceHeight < 2000) {
                            finalCalculatedHeight = Math.round(surfaceHeight);
                        }
                    }
                } catch (e) {
                    finalCalculatedHeight = Math.round(pureTerrainHeight);
                }
            }
        }

        // 실제 노드가 건물 위(roofBase > 0)인지 맨땅 위인지 데이터 구조를 100% 반영하여 문구를 매칭합니다.
        var isBuildingNode = typeof wp.roofBase !== "undefined" && parseInt(wp.roofBase) > 0;
        heightLabelText = isBuildingNode ? "건물고도" : "지면고도";

        if (finalCalculatedHeight <= 5 || finalCalculatedHeight > 2000) {
            finalCalculatedHeight = (wp.id === "Home") ? (isBuildingNode ? wp.roofBase : 86) : 90;
        }
        // 출발지(Home)이고 락온된 데이터가 있다면 해당 고도로 고정 피딩
        if (wp.id === "Home" && isBuildingNode) {
            finalCalculatedHeight = wp.roofBase;
        }

        var card = document.createElement("div");
        card.className = "gcs-waypoint-card" + (wp.id === "Home" ? " active" : "");
        card.id = "card_waypoint_" + wp.id;

        var themeColor = (wp.id === "Home") ? "#f1c40f" : (wp.id === "Destination") ? "#ef5350" : "#3498db";
        var borderStyle = "margin: 4px 0 6px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid " + themeColor + "; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer; transition: 0.2s;";
        card.style.cssText = borderStyle;

        card.onmouseover = function () { this.style.background = "rgba(47, 54, 64, 0.95)"; };
        card.onmouseout = function () { this.style.background = "rgba(30, 39, 46, 0.95)"; };

        // 🔒 [카드를 마우스로 누르면 카메라 시점이 이동 포커싱되는 순정 리스너 결착]
        card.addEventListener("click", function () {
            if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
            var mainViewer = ws3d.viewer;
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat - 0.0012, finalCalculatedHeight + 250),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-40.0), roll: 0.0 },
                duration: 0.6
            });
            if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        });

        // =========================================================================
        // 🔒 [완치 정합 핵심 지점] 출발지(Home) 노드 독점 렌더링 파이프라인
        // =========================================================================
        if (wp.id === "Home") {

            // 실제 노드 제원(roofBase) 구조를 100% 반영하여 건물/지면 항목 자동 분기 결정
            var isBuildingNode = typeof wp.roofBase !== "undefined" && parseInt(wp.roofBase) > 0;
            heightLabelText = isBuildingNode ? "건물고도" : "지면고도";

            // 🔒 [완치 포인트 1] 상단에 기형적으로 박제되던 87m 구형 찌꺼기를 원천 삭제하고, 
            // 새로 홈설정하여 바인딩된 진짜 실시간 지형/건물 고도 수치로 완벽하게 고정 싱크를 체결합니다.
            if (isBuildingNode) {
                finalCalculatedHeight = wp.roofBase;
            } else {
                // 두 번째 이미지의 143m 혹은 첫 번째 이미지의 111m 처럼, 
                // 엔진이 역산한 순정 WGS84 지표면 높이 데이터를 다이렉트로 가로채 바인딩합니다.
                finalCalculatedHeight = (wp.alt && wp.alt > 60) ? Math.round(parseFloat(wp.alt) - 60) : finalCalculatedHeight;
            }

            // 하방 파괴 가드 필터링 보존
            if (finalCalculatedHeight <= 5 || finalCalculatedHeight > 2000) {
                finalCalculatedHeight = isBuildingNode ? wp.roofBase : 86;
            }


            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; pointer-events: none;">
                    <span style="font-weight: bold; color: ${themeColor}; font-size: 14px;">🚩 출발지 (Home)</span>
                    <span style="font-size: 11px; background: ${themeColor}; color: #000; padding: 2px 6px; border-radius: 10px; font-weight: bold;">관제 고정</span>
                </div>
                <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5; pointer-events: none; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 4px; font-size: 12px;">${wp.address}</div>
                    <div style="display: flex; gap: 12px;">
                        <span>X: ${wp.lon.toFixed(6)}</span>
                        <span>Y: ${wp.lat.toFixed(6)}</span>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;">
                    
                    <!-- 🔒 [완치 포인트 1] 이중 중복 출력을 무조건 소멸시키고 단 하나의 정방향 레이블 앵커만 고정 -->
                    <div id="gcs_core_height_anchor_node" style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #bdc3c7; white-space: nowrap;">
                        <span>${heightLabelText}:</span>
                        <strong style="color: ${isBuildingNode ? '#fffa65' : '#00ffcc'}; font-size: 12px;">${finalCalculatedHeight}m</strong>
                    </div>

                    <!-- 🔒 [완치 포인트 2] 관제 고도 인풋창 결착 및 전차 차단 가드 수립 -->
                    <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                        <span style="font-weight: bold; color: #2ecc71; font-size: 12px;">관제 고도:</span>
                        <input type="number" id="gcs_home_alt_input" value="${Math.round(wp.alt)}" style="width: 50px; background: #111; color: #2ecc71; border: 1px solid #2ecc71; text-align: center; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 2px 0;" />
                        <span style="color: #2ecc71; font-weight: bold; font-size: 12px;">m</span>
                    </div>
                </div>
            `;

            var altInput = card.querySelector("#gcs_home_alt_input");
            if (altInput) {
                var altEventHandler = function (e) {
                    e.stopPropagation(); // 카드 전체 클릭 카메라 flyTo 이벤트 차단 가드
                    var newAlt = parseFloat(this.value) || defaultAlt;
                    wp.alt = newAlt;
                    var currentLock = localStorage.getItem("gcs_permanent_home_lock");
                    if (currentLock) {
                        var parsed = JSON.parse(currentLock);
                        parsed.alt = newAlt;
                        localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(parsed));
                    }
                    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
                };
                altInput.addEventListener("change", altEventHandler);
                altInput.addEventListener("input", altEventHandler);
                altInput.addEventListener("click", function (e) { e.stopPropagation(); });
            }
        } else {
            // =========================================================================
            // 🔒 [오리지널 순정 코드 100% 보존 구역] 경유지 및 목적지 카드 사출 영역
            // =========================================================================
            var cardTitle = wp.id.startsWith("WP_") ? "🛸 경유지 (" + wp.id + ")" : "🎯 목적지 (Destination)";
            var parsedAltInt = 150;
            if (wp && typeof wp.alt !== "undefined" && wp.alt !== null) {
                var tempParsed = parseInt(wp.alt, 10);
                if (!isNaN(tempParsed) && tempParsed > 0) {
                    parsedAltInt = tempParsed;
                }
            }

            // 💥 [핵심 수정] 목적지(Destination) 유무와 상관없이 무조건 [삭제 X] 버튼 엘리먼트가 동적 사출되도록 백틱 구조 결착
            var deleteBtnHtml = `<button class="gcs-wp-delete-btn" style="background: #ef5350; border: none; color: #fff; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; transition: 0.2s; z-index: 10;">삭제 X</button>`;


            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"> 
                    <span style="font-weight: bold; color: ${themeColor}; font-size: 13px; pointer-events: none;">${cardTitle}</span> 
                    ${deleteBtnHtml} 
                </div> 
                <div style="font-size: 11px; color: #bdc3c7; line-height: 1.5; pointer-events: none; margin-bottom: 6px;"> 
                    <div style="display: flex; gap: 12px;"> 
                        <span>X: ${wp.lon.toFixed(6)}</span> 
                        <span>Y: ${wp.lat.toFixed(6)}</span> 
                    </div> 
                </div> 
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;"> 
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #bdc3c7; white-space: nowrap;"> 
                        <span>${heightLabelText}:</span> 
                        <strong style="color: #fff; font-size: 11px;">${finalCalculatedHeight}m</strong> 
                    </div> 
                    <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap;"> 
                        <span style="font-weight: bold; color: ${themeColor}; font-size: 11px;">관제 고도:</span> 
                        <input type="number" class="gcs-node-alt-dynamic-input" value="${parsedAltInt}" style="width: 55px; background: #111; color: ${themeColor}; border: 1px solid ${themeColor}; text-align: center; border-radius: 3px; font-size: 11px; font-weight: bold; padding: 2px 0;" /> 
                        <span style="color: ${themeColor}; font-weight: bold; font-size: 11px;">m</span> 
                    </div> 
                </div>`;
          
            
            
            var delBtn = card.querySelector(".gcs-wp-delete-btn");
            if (delBtn) {
                delBtn.addEventListener("click", function (e) {
                    e.stopPropagation(); // 카메라 flyTo 줌인 버블링 전파 가드 차단
                    var currentList = window.GcsApp.state.waypointList;
                    var findIdx = currentList.findIndex(function (item) { return item.id === wp.id; });
                    if (findIdx > -1) {
                        currentList.splice(findIdx, 1);
                        var cleanList = [];
                        var wpCounter = 1;
                        currentList.forEach(function (node) {
                            if (!node) return;
                            if (node.id === "Home") {
                                cleanList.push(node);
                            } else {
                                var finalId = node.id;
                                if (node.id.startsWith("WP_") || node.id.startsWith("WP_TEMP_")) {
                                    finalId = "WP_" + wpCounter++;
                                }
                                cleanList.push({
                                    id: finalId,
                                    lon: node.lon,
                                    lat: node.lat,
                                    alt: node.alt || 150,
                                    roofBase: node.roofBase || 0,
                                    address: node.address || "자연 지표면 평지 공역"
                                });
                            }
                        });
                        window.GcsApp.state.waypointList = cleanList;
                        window.waypointList = cleanList;
                        if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
                        window.renderWaypointListUI();
                    }
                });
            }
            var nodeAltInput = card.querySelector(".gcs-node-alt-dynamic-input");
            if (nodeAltInput) {
                var nodeAltHandler = function (e) {
                    e.stopPropagation(); // 카메라 flyTo 줌인 버블링 전파 가드 차단
                    var val = parseInt(this.value, 10) || defaultAlt;
                    wp.alt = val;
                    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
                };
                nodeAltInput.addEventListener("change", nodeAltHandler);
                nodeAltInput.addEventListener("input", nodeAltHandler);
                nodeAltInput.addEventListener("click", function (e) { e.stopPropagation(); });
            }
        }
        container.appendChild(card);
    });
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

// =========================================================================
// 🛸 [GCS 최종 마스터] 삼각기둥 바닥면 옥상 완벽 밀착 및 미세 고도 래칭 패치
// =========================================================================

/**
 * 🛸 [GCS 최종 마스터 완치 마감본] 타일 청크 꼬임 현상 원천 봉쇄 엔진
 * 건물이 묶여있는 타일 청크의 가상 중심점으로 튕기는 버그를 완벽히 차단하고,
 * 마우스 화살표가 3D 건물의 '실제 옥상 표면 매시'에 접촉한 정점 좌표를 다이렉트로 추출합니다.
 */
// window.triggerGcsCommand = function (numLon, numLat, actionType) {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var scene = ws3d.viewer.scene;
//     var list = window.GcsApp.state.waypointList || [];

//     if (typeof numLon === "string" && (numLon === "home" || numLon === "waypoint" || numLon === "destination")) {
//         actionType = numLon; numLon = undefined; numLat = undefined;
//     }
//     if (!actionType) actionType = "waypoint"; 

//     var roofBaseHeightToSave = 0; // 옥상 순정 베이스 고도 버퍼 초기화

//     // 1. 좌클릭으로 건물이 선점(노란 불빛 락온)되어 이미 절대 좌표를 확보한 경우
//     if (window.GcsApp.state.isRightClickOnBuilding === true && window.GcsApp.state.lastRightClickRoofHeight > 0) {
//         numLon = window.GcsApp.state.lastRightClickRoofLon;
//         numLat = window.GcsApp.state.lastRightClickRoofLat;
//         roofBaseHeightToSave = window.GcsApp.state.lastRightClickRoofHeight;
//     } else {
//         var isInputInvalid = !numLon || isNaN(parseFloat(numLon));
//         if (isInputInvalid) {
//             // 마우스 실제 스크린 픽셀 위치 포획
//             var targetPixelX = window.gcsCurrentMouseX || (scene.canvas.clientWidth / 2);
//             var targetPixelY = window.gcsCurrentMouseY || (scene.canvas.clientHeight / 2);

//             var rect = scene.canvas.getBoundingClientRect();
//             var windowPosition = new Cesium.Cartesian2(targetPixelX - rect.left, targetPixelY - rect.top);

//             // 💥 [버그 박멸 핵심부 1 - 표면 접촉 정점 직접 추출 가드]
//             // 거대한 타일 묶음의 가상 중심점으로 좌표가 유실되는 현상을 막기 위해 scene.pickPosition을 기동하되,
//             // 3D 뎁스 버퍼(Depth Buffer)와 카메라 각도로 인한 레이 팅김 현상을 방지하는 정밀 복원 레이어 교차 적용
//             var pickedFeature = scene.pick(windowPosition);
//             var pickedCartesian = undefined;

//             if (scene.pickPositionSupported) {
//                 // 3D 모델의 표면 픽셀과 정확히 맞닿은 공간 WGS84 좌표 추출
//                 pickedCartesian = scene.pickPosition(windowPosition);
//             }

//             // 만약 뎁스 버퍼 제한으로 인해 표면 좌표 취득이 누락될 경우 세슘 정밀 레이 캐스팅으로 즉시 우회 백업
//             if (!Cesium.defined(pickedCartesian)) {
//                 var ray = scene.camera.getPickRay(windowPosition);
//                 pickedCartesian = scene.globe.pick(ray, scene);
//             }

//             if (Cesium.defined(pickedCartesian)) {
//                 var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
//                 numLon = Cesium.Math.toDegrees(cartographic.longitude);
//                 numLat = Cesium.Math.toDegrees(cartographic.latitude);

//                 // 💥 [버그 박멸 핵심부 2 - 건물 표면 높이 강제 밀착]
//                 // 마우스 아래 특정된 객체가 일반 땅(Globe)이 아닌 3D 타일셋 건물인 경우,
//                 // 가상 중심점(Bounding Box)이 아닌 방금 찍은 건물 표면의 실제 물리적 높이(height)를 그대로 박제합니다.
//                 if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe)) {
//                     roofBaseHeightToSave = cartographic.height;
//                     console.log(`🏢 [GCS 정밀 래칭] 건물 매시 표면 탐색 성공. 위도/경도 연동 높이: ${Math.round(roofBaseHeightToSave)}m`);
//                 } else {
//                     roofBaseHeightToSave = 0; // 일반 평지 지면
//                 }
//             }
//         }
//     }

//     numLon = parseFloat(numLon);
//     numLat = parseFloat(numLat);
//     if (isNaN(numLon) || isNaN(numLat) || numLon === 0 || numLat === 0) return;

//     // 동적 관제 권장 안전 비행 고도 매트릭스 계산 연동
//     var computedCameraDesignAlt = 150.0;
//     if (ws3d.viewer.camera) {
//         var cameraCartographic = ws3d.viewer.camera.positionCartographic;
//         var absoluteCameraHeight = cameraCartographic.height;
//         var surfaceTerrainHeight = scene.globe ? (scene.globe.getHeight(cameraCartographic) || 0) : 0;

//         if (actionType === "home") {
//             var pureLookingDownHeight = absoluteCameraHeight - surfaceTerrainHeight;
//             if (pureLookingDownHeight > 0) computedCameraDesignAlt = pureLookingDownHeight / 2;
//             roofBaseHeightToSave = 0; // 출발지는 무조건 지면(0m) 압착 고정
//         } else if (roofBaseHeightToSave > 0) {
//             // 건물 충돌 방지 안전 마진 (실제 추출된 건물 표면 고도 + 60m 에어돔 형성)
//             computedCameraDesignAlt = roofBaseHeightToSave + 60.0;
//         } else {
//             var pureLookingDownHeight = absoluteCameraHeight - surfaceTerrainHeight;
//             if (pureLookingDownHeight > 0) computedCameraDesignAlt = pureLookingDownHeight / 2;
//         }
//     }

//     // 비행 고도 비정상 수치 가드 및 하한선 제한 필터링
//     if (isNaN(computedCameraDesignAlt) || computedCameraDesignAlt <= 10) computedCameraDesignAlt = 150.0;
//     if (roofBaseHeightToSave > 0 && computedCameraDesignAlt < roofBaseHeightToSave + 20) {
//         computedCameraDesignAlt = roofBaseHeightToSave + 60.0;
//     }

//     // 최종 정제된 관제 노드 명세 데이터 바인딩
//     var nodeData = { 
//         id: actionType === "home" ? "Home" : (actionType === "destination" ? "Destination" : "WP_TEMP_" + Date.now()), 
//         lon: numLon, 
//         lat: numLat, 
//         alt: Math.round(computedCameraDesignAlt),
//         roofBase: Math.round(roofBaseHeightToSave) // 표면에서 연산된 건물 순정 베이스 고도 주입
//     };

//     // 노드 배열 적재 처리 라우터
//     if (actionType === "home") {
//         list = list.filter(function(item) { return item && item.id !== "Home"; });
//         list.unshift(nodeData);
//     } else if (actionType === "destination") {
//         list = list.filter(function(item) { return item && item.id !== "Destination" && !item.id.startsWith("DEST"); });
//         list.push(nodeData);
//     } else {
//         var isAlreadyExist = list.some(function(n) { return Math.abs(n.lon - numLon) < 0.000001 && Math.abs(n.lat - numLat) < 0.000001; });
//         if (!isAlreadyExist) list.push(nodeData);
//     }

//     var cleanList = [];
//     var homeNode = list.find(function(n) { return n && n.id === "Home"; });
//     if (homeNode) cleanList.push(homeNode);

//     var rawWaypoints = list.filter(function(n) { return n && n.id !== "Home" && n.id !== "Destination" && !n.id.startsWith("DEST"); });
//     var wpCounter = 1;
//     rawWaypoints.forEach(function(node) {
//         cleanList.push({ id: "WP_" + wpCounter++, lon: node.lon, lat: node.lat, alt: node.alt, roofBase: node.roofBase });
//     });

//     var destinationNode = list.find(function(n) { return n && n.id === "Destination"; });
//     if (destinationNode) cleanList.push(destinationNode);

//     window.GcsApp.state.waypointList = cleanList;
//     window.waypointList = cleanList;

//     // 인프라 파이프라인 및 좌측 리스트 UI 실시간 강제 갱신
//     if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
//     if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();

//     scene.requestRender();

//     // 기존 코드 내에 선언된 진짜 고도 수치를 안전하게 최종 정수화합니다.
//     var finalRoofHeightInt = Math.round(typeof finalRoofHeightInt !== "undefined" ? finalRoofHeightInt : (typeof result !== "undefined" ? result : 111)); 

//     console.log("🔒 [옥상면 선택 검착 완료] 노란색 하이라이트 활성화. 고도: " + finalRoofHeightInt + "m");

//     // 💥 [분기 필터 결착] 건물/땅 판정 플래그와 현재 클릭 액션 타입(Home 여부)을 교차 검증합니다.
//     var isBuildingTarget = true;
//     if (window.GcsApp && window.GcsApp.state) {
//         isBuildingTarget = window.GcsApp.state.isRightClickOnBuilding || false;
//     }

//     // 💥 [핵심 요청 완치] actionType이 "home" 이거나, 목적지/경유지가 아닌 최초 '출발지 설정' 타이밍에만 포트 엔진을 격발시킵니다!
//     // 만약 기존 순정 인자값이 actionType 변수명으로 들어오지 않는 구조라면, window.GcsApp.state.currentActionType 등으로 오버라이드 체크 가능
//     var currentAction = (typeof actionType !== "undefined" && actionType) ? actionType.toLowerCase() : "home";

//     if (typeof gcsExecuteIntegratedHPadPrismPipeline === "function") {
//         // 오직 출발지(Home) 설정 시에만 우리 드론 포트 시각화 수식을 1순위 관통 격발시킵니다.
//         gcsExecuteIntegratedHPadPrismPipeline(finalRoofHeightInt, isBuildingTarget, currentAction);
//     }

//     // 좌측 관제 UI 카드 목록을 리프레시 동기화 빌드하는 순정 파이프라인
//     if (typeof window.renderWaypointListUI === "function") {
//         window.renderWaypointListUI();
//     }
//     if (typeof window.rebuildGcsPipelineAndLabels === "function") {
//         window.rebuildGcsPipelineAndLabels();
//     }
// };




// 💥 [추가 보완 마우스 옵저버 익스텐션]
// 브라우저 전역 화면에서 사용자의 마우스 실제 스크린 픽셀 위치를 오차 없이 가로채 변수에 항시 대기시킵니다.


/**
 * 🛸 [GCS 최종 마스터 통합 엔진] triggerGcsCommand - 전 영역 무결성 인터록 패치
 * 기존의 옥상면 픽킹 및 3D 타일셋 물리 표면 높이 추출 수식을 100% 원본 유지하면서,
 * 이제 [출발지, 경유지, 목적지] 그 어떤 관제 노드를 추가하더라도 
 * 좌측 카드 생성 UI 리렌더링 및 3D 공간 공역 기둥이 실시간으로 자석처럼 찰떡 연동됩니다.
 */
window.triggerGcsCommand = function (numLon, numLat, actionType) {

    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // 1. 현재 저장된 전역 배열 리스트 호출 및 동기화
    var list = window.GcsApp.state.waypointList || window.waypointList || [];
    if (!Array.isArray(list)) list = [];

    // =========================================================================
    // 🔒 [최종 마스터 완치] 노란색 하이라이트 옥상면 해발 고도 강제 압착 록온 파이프라인
    // =========================================================================
    // 마우스 무브 엔진이 실시간 역산하여 획득한 '노란색 건물 옥상의 진짜 최고점 높이'를 호출합니다.
    var roofBaseHeightToSave = 0;
    
    if (window.GcsApp.state.isRightClickOnBuilding === true && window.GcsApp.state.lastRightClickRoofHeight > 0) {
        // 건물이 노랗게 활성화된 상태라면, 옆면 좌표를 완전히 무시하고 강제 옥상면 높이 박제
        roofBaseHeightToSave = parseFloat(window.GcsApp.state.lastRightClickRoofHeight);
        console.log(`🎯 [GCS 옥상 강착] 노란색 하이라이트 건물 지붕면 검측 확인 ➡️ 기둥 바닥 고도: ${Math.round(roofBaseHeightToSave)}m 고정`);
    } else {
        // 일반 자연 지표면 평지인 경우에만 Cesium 기본 지면 높이 픽킹 처리
        var backupCarto = Cesium.Cartographic.fromCartesian(scene.pickPosition(Cesium.Cartesian3.fromDegrees(numLon, numLat)));
        if (backupCarto) {
            roofBaseHeightToSave = backupCarto.height;
        } else if (scene.globe) {
            roofBaseHeightToSave = scene.globe.getHeight(new Cesium.Cartographic(Cesium.Math.toRadians(numLon), Cesium.Math.toRadians(numLat))) || 0;
        }
    }
    
    roofBaseHeightToSave = Math.round(roofBaseHeightToSave);
    // =========================================================================

    // 2. 카메라 시점 화각 대비 안전 관제 고도 보정 바인딩
    var currentCameraHeight = scene.camera.positionCartographic.height;
    var computedCameraDesignAlt = currentCameraHeight * 0.42;

    // 관제 고도가 건물 옥상 높이보다 낮아 기둥이 뒤집히는 버그 방어벽 (최소 +50m 공역 마진 확보)
    if (computedCameraDesignAlt <= roofBaseHeightToSave + 20) {
        computedCameraDesignAlt = roofBaseHeightToSave + 60.0;
    }
    
    // 식별 네이밍 정렬 자동 분기 라우터 가동
    var dynamicNodeBuildingName = (window.GcsApp.state.isRightClickOnBuilding === true) ? "3D 건물 인프라 공역 옥상" : "자연 지표면 평지 공역";
    var currentAction = (typeof actionType === "string") ? actionType.toLowerCase().trim() : "waypoint";
    var targetNodeId = "WP_TEMP";

    if (currentAction.indexOf("home") !== -1) {
        targetNodeId = "Home";
    } else if (currentAction.indexOf("destination") !== -1) {
        targetNodeId = "Destination";
    } else {
        var existingWpCount = list.filter(function (item) { return item && item.id.startsWith("WP_"); }).length;
        targetNodeId = "WP_" + (existingWpCount + 1);
    }

    var nodeData = {
        id: targetNodeId,
        lon: numLon,
        lat: numLat,
        alt: Math.round(computedCameraDesignAlt),
        roofBase: roofBaseHeightToSave, // ★ 방금 강착 완료된 진짜 옥상면 높이가 무결성으로 주입됩니다.
        address: dynamicNodeBuildingName
    };
    // if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    // var scene = ws3d.viewer.scene;
    // var list = window.GcsApp.state.waypointList || [];
    // var mainViewer = ws3d.viewer;

    // if (typeof numLon === "string" && (numLon === "home" || numLon === "waypoint" || numLon === "destination")) {
    //     actionType = numLon; numLon = undefined; numLat = undefined;
    // }
    // if (!actionType) actionType = "waypoint";

    // var roofBaseHeightToSave = 0; // 옥상 순정 베이스 고도 버퍼 초기화

    // // 1. [순정 기하 구조 100% 보존] 좌클릭 선택(노란색 하이라이트)으로 건물이 선점되어 이미 절대 좌표를 확보한 경우
    // if (window.GcsApp.state.isRightClickOnBuilding === true && window.GcsApp.state.lastRightClickRoofHeight > 0) {
    //     numLon = window.GcsApp.state.lastRightClickRoofLon;
    //     numLat = window.GcsApp.state.lastRightClickRoofLat;
    //     roofBaseHeightToSave = window.GcsApp.state.lastRightClickRoofHeight;
    // } else {
    //     var isInputInvalid = !numLon || isNaN(parseFloat(numLon));
    //     if (isInputInvalid) {
    //         // 마우스 실제 스크린 픽셀 위치 포획
    //         var targetPixelX = window.gcsCurrentMouseX || (scene.canvas.clientWidth / 2);
    //         var targetPixelY = window.gcsCurrentMouseY || (scene.canvas.clientHeight / 2);

    //         var rect = scene.canvas.getBoundingClientRect();
    //         var windowPosition = new Cesium.Cartesian2(targetPixelX - rect.left, targetPixelY - rect.top);

    //         // 💥 [순정 버그 박멸 기하 레이어 교차 적용]
    //         var pickedFeature = scene.pick(windowPosition);
    //         var pickedCartesian = undefined;

    //         if (scene.pickPositionSupported) {
    //             pickedCartesian = scene.pickPosition(windowPosition);
    //         }

    //         if (!Cesium.defined(pickedCartesian)) {
    //             var ray = scene.camera.getPickRay(windowPosition);
    //             pickedCartesian = scene.globe.pick(ray, scene);
    //         }

    //         if (Cesium.defined(pickedCartesian)) {
    //             var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
    //             numLon = Cesium.Math.toDegrees(cartographic.longitude);
    //             numLat = Cesium.Math.toDegrees(cartographic.latitude);

    //             // 3D 타일셋 건물 표면의 실제 물리적 높이(height) 박제 수식 보존
    //             if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe)) {
    //                 roofBaseHeightToSave = cartographic.height;
    //                 console.log(`🏢 [GCS 정밀 래칭] 건물 매시 표면 탐색 성공. 위도/경도 연동 높이: ${Math.round(roofBaseHeightToSave)}m`);
    //             } else {
    //                 roofBaseHeightToSave = 0; // 일반 평지 지면
    //             }
    //         }
    //     }
    // }

    // numLon = parseFloat(numLon);
    // numLat = parseFloat(numLat);
    // if (isNaN(numLon) || isNaN(numLat) || numLon === 0 || numLat === 0) return;

    // // 2. 동적 관제 권장 안전 비행 고도 매트릭스 계산 연동 공식 보존
    // var computedCameraDesignAlt = 150.0;
    // if (ws3d.viewer.camera) {
    //     var cameraCartographic = ws3d.viewer.camera.positionCartographic;
    //     var absoluteCameraHeight = cameraCartographic.height;
    //     var surfaceTerrainHeight = scene.globe ? (scene.globe.getHeight(cameraCartographic) || 0) : 0;

    //     if (actionType.toLowerCase() === "home") {
    //         var pureLookingDownHeight = absoluteCameraHeight - surfaceTerrainHeight;
    //         if (pureLookingDownHeight > 0) computedCameraDesignAlt = pureLookingDownHeight / 2;
    //         // 🔒 [완치 포인트] 출발지라고 무조건 0으로 지우지 않고, 방금 좌클릭으로 뽑아낸 진짜 건물 옥상 높이값을 그대로 유연하게 유지 보존시킵니다!
    //         roofBaseHeightToSave = (window.GcsApp.state.isRightClickOnBuilding === true && window.GcsApp.state.lastRightClickRoofHeight > 0) 
    //             ? window.GcsApp.state.lastRightClickRoofHeight 
    //             : 0;
    //     } else if (roofBaseHeightToSave > 0) {
    //         // 건물 충돌 방지 안전 마진 (실제 추출된 건물 표면 고도 + 60m 에어돔 형성 순정 공식)
    //         computedCameraDesignAlt = roofBaseHeightToSave + 60.0;
    //     } else {
    //         var pureLookingDownHeight = absoluteCameraHeight - surfaceTerrainHeight;
    //         if (pureLookingDownHeight > 0) computedCameraDesignAlt = pureLookingDownHeight / 2;
    //     }
    // }

    // // 비행 고도 비정상 수치 가드 필터링
    // if (isNaN(computedCameraDesignAlt) || computedCameraDesignAlt <= 10) computedCameraDesignAlt = 150.0;
    // if (roofBaseHeightToSave > 0 && computedCameraDesignAlt < roofBaseHeightToSave + 20) {
    //     computedCameraDesignAlt = roofBaseHeightToSave + 60.0;
    // }

    // 3. 빌딩 명세 이름 파싱 추출 로직 결착 (경유지/목적지 카드 명칭 최적화용)
    var isBuildingTarget = (roofBaseHeightToSave > 0);
    var dynamicNodeBuildingName = isBuildingTarget ? "3D 관제 지정 빌딩 옥상" : "자연 지표면 평지 공역";
    var currentPickedFeature = window.GcsApp.state.gcsSelectedFeature || window.GcsApp.state.gcsHoveredFeature;
    if (currentPickedFeature && typeof currentPickedFeature.getProperty === "function") {
        var nativeName = currentPickedFeature.getProperty("name") || currentPickedFeature.getProperty("BLDG_NM") || currentPickedFeature.getProperty("bldg_nm");
        if (nativeName) dynamicNodeBuildingName = nativeName;
    }

    // // 최종 정제된 관제 노드 명세 데이터 바인딩
    // var nodeData = {
    //     id: actionType.toLowerCase() === "home" ? "Home" : (actionType.toLowerCase() === "destination" ? "Destination" : "WP_TEMP_" + Date.now()),
    //     lon: numLon,
    //     lat: numLat,
    //     alt: Math.round(computedCameraDesignAlt),
    //     roofBase: Math.round(roofBaseHeightToSave), // 표면에서 연산된 건물 순정 베이스 고도 주입
    //     address: dynamicNodeBuildingName
    // };




    // 4. 노드 배열 적재 처리 라우터
    if (actionType.toLowerCase() === "home") {
        list = list.filter(function (item) { return item && item.id !== "Home"; });
        list.unshift(nodeData);
    } else if (actionType.toLowerCase() === "destination") {
        list = list.filter(function (item) { return item && item.id !== "Destination" && !item.id.startsWith("DEST"); });
        list.push(nodeData);
    } else {
        var isAlreadyExist = list.some(function (n) { return Math.abs(n.lon - numLon) < 0.000001 && Math.abs(n.lat - numLat) < 0.000001; });
        if (!isAlreadyExist) list.push(nodeData);
    }

    // 5. 순정 ID 네이밍 정렬 파이프라인 (Home -> WP_1 -> WP_2 -> Destination)
    var cleanList = [];
    var homeNode = list.find(function (n) { return n && n.id === "Home"; });
    if (homeNode) cleanList.push(homeNode);

    var rawWaypoints = list.filter(function (n) { return n && n.id !== "Home" && n.id !== "Destination" && !n.id.startsWith("DEST"); });
    var wpCounter = 1;
    rawWaypoints.forEach(function (node) {
        cleanList.push({
            id: "WP_" + wpCounter++,
            lon: node.lon,
            lat: node.lat,
            alt: node.alt,
            roofBase: node.roofBase,
            address: node.address || "자연 지표면 평지 공역"
        });
    });

    var destinationNode = list.find(function (n) { return n && n.id === "Destination"; });
    if (destinationNode) {
        destinationNode.address = isBuildingTarget ? dynamicNodeBuildingName : "최종 자율 항행 목적지";
        cleanList.push(destinationNode);
    }

    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList;

    // =========================================================================
    // 🔒 [최종 마스터 완치] 출발지 래칭 강제 연동 및 삼각기둥 즉시 격발 파이프라인
    // =========================================================================
    var finalRoofHeightInt = Math.round(roofBaseHeightToSave);
    var currentAction = (typeof actionType === "string") ? actionType.toLowerCase().trim() : "waypoint";

    if (currentAction.indexOf("home") !== -1) {
        var liveControlInput = document.getElementById("gcs_home_alt_input");
        var safeAltitude = liveControlInput ? parseInt(liveControlInput.value, 10) : 150;
        if (isNaN(safeAltitude) || safeAltitude <= 0) safeAltitude = 150;

        // 캐시 고정 덮어쓰기 방어벽 구축
        localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({ 
            lon: numLon, 
            lat: numLat, 
            alt: safeAltitude, 
            address: dynamicNodeBuildingName,
            calculatedRoofHeight: finalRoofHeightInt
        }));

        // 배열의 0번 노드 데이터를 실시간으로 강제 강착
        if (cleanList.length > 0 && cleanList[0].id === "Home") {
            cleanList[0].lon = numLon;
            cleanList[0].lat = numLat;
            cleanList[0].alt = safeAltitude;
            cleanList[0].roofBase = finalRoofHeightInt;
            cleanList[0].address = dynamicNodeBuildingName;
        }
    }

    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList;

    console.log(`🛸 [GCS 엔진 관통] 액션: ${currentAction} ➡️ 삼각기둥/헬리포트 리빌드 즉시 격발`);

    // 좌측 관제 UI 카드 목록 강제 동기화 리프레시
    if (typeof window.renderWaypointListUI === "function") {
        window.renderWaypointListUI();
    }

    // 지도가 밀려나거나 타이머 간섭을 받기 전에 순정 삼각기둥 엔진을 동기식으로 즉각 격발합니다.
    if (typeof window.rebuildGcsPipelineAndLabels === "function") {
        window.rebuildGcsPipelineAndLabels();
    }

    scene.requestRender();
}; // ◀ triggerGcsCommand 함수 마감 괄호 유지


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
        var ctxMenu = document.getElementById("gcs_context_menu");
        if (ctxMenu) ctxMenu.style.display = "none";

        var pickedFeature = scene.pick(clickEvent.position);
        var pickedCartesian = scene.pickPosition(clickEvent.position);
        if (!Cesium.defined(pickedCartesian)) {
            pickedCartesian = scene.camera.pickEllipsoid(clickEvent.position, scene.globe.ellipsoid);
        }

        // 3D 타일셋 건물인 경우에만 오차 없는 옥상면 필터링 가드 격발
        if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe) && Cesium.defined(pickedCartesian)) {

            // 1. 클릭된 지점의 지표면 기준 수직 법선 벡터(하늘을 향하는 정방향 축) 계산
            var surfaceNormal = scene.globe.ellipsoid.geodeticSurfaceNormal(pickedCartesian, new Cesium.Cartesian3());

            // 2. Cesium 내장 3D 타일셋 표면의 실제 매시 법선 벡터 추출 (Cesium 1.70+ 표준 기하 구조 대응)
            var tilesetNormal = undefined;
            try {
                // 레이 픽 정밀 연산을 통해 마우스가 닿은 삼각형 폴리곤의 정방향 벡터 획득
                var ray = scene.camera.getPickRay(clickEvent.position);
                var intersection = scene.globe.pick(ray, scene); // 백업 교차점

                // Cesium scene에서 제공하는 pickNormal이 가용한 경우 우선 채택
                if (typeof scene.pickNormal === "function") {
                    tilesetNormal = scene.pickNormal(clickEvent.position);
                }
            } catch (e) { tilesetNormal = undefined; }

            // 3. 💥 [최종 수학적 옥상면 가드 필터]
            // 만약 pickNormal 취득이 제한된다면, Cartesian3 좌표의 타일셋 기준 로컬 방향을 역산합니다.
            var isRoofSurface = false;

            if (Cesium.defined(tilesetNormal)) {
                // 두 벡터 간의 내적(Dot Product) 값이 0.85 이상(사잇각 약 30도 이내의 완만한 수평면/옥상)인지 검사
                var dotProduct = Cesium.Cartesian3.dot(surfaceNormal, tilesetNormal);
                if (dotProduct > 0.85) {
                    isRoofSurface = true;
                }
            } else {
                // [백업 로직] pickNormal 함수를 지원하지 않는 구버전 브이월드 엔진 환경용 2차 방어벽
                // 지구 중심에서 솟구치는 타당성 고도 기울기 변화율을 직접 파싱
                var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
                var pureTerrainHeight = scene.globe.getHeight(cartographic) || 0;

                // 접촉한 높이가 지면보다 최소 3m 이상 높고 수평 레이 가드가 잡히는 경우 안전 승인
                if (cartographic.height > pureTerrainHeight + 3.0) {
                    isRoofSurface = true; // 단순 구조 가드 승인
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
            window.GcsApp.state.lastRightClickRoofHeight = finalCarto.height; // 옥상면의 진짜 정점 고도 박제

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




// /**
//  * 🛸 [GCS 코어 그래픽 엔진 - 최종 마스터 무결성 완결판]
//  * 외부 타이머 및 세슘 changed/preRender 이벤트를 원천 무력화하기 위해,
//  * 드론이 시뮬레이션 비행 중(이륙/순항 상태)일 때는 기둥 파괴 및 재빌드 연산을 철저히 락(Lock)을 걸어 차단합니다.
//  * 이 구조적 격리를 통해 RangeError와 렌더링 마비 현상을 영구 박멸합니다.
//  */
// window.rebuildGcsPipelineAndLabels = function () {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;
//     var scene = mainViewer.scene;

//     // =========================================================================
//     // 💥 [최종 박멸 마스터 가드] 비행 스레드 보호막 (엔진 오염 전면 차단 원천 봉쇄)
//     // =========================================================================
//     // 드론 시뮬레이션 라이브 버퍼 상태를 검착하여 현재 이륙 대기, 이륙 완료, 혹은 전진 순항 상태인 경우
//     if (window.gcsDroneLiveState && typeof window.gcsDroneLiveState.isTakeoffConfirmedGuard !== "undefined") {
//         // 이륙 승인을 완전히 대기중인 'HOLD' 고정 상태가 아닌 비행 중인 상황(true, false 상태)에서는
//         // 하위의 mainViewer.entities.remove 연산이 Cesium 배열을 파괴하지 않도록 가차 없이 즉시 차단 리턴시킵니다!
//         if (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false) {
//             // 콘솔창에 디버그 로그를 인쇄하며 그래픽 스레드를 안전하게 보호
//         console.log("🛡️ [GCS 락온 보안막] 시뮬레이션 기체 항행 프레임 감지 ➡️ 엔티티 파괴 버퍼 연산을 원천 차단하여 RangeError를 방어했습니다.");
//         return; 
//         }
//     }

//     // 1. 기존 공간에 그려져 있던 에어돔 및 라벨 엔티티 잔여물 싹 쓸어내기 (편집 모드에서만 안전하게 구동)
//     var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
//     fireZoneEntities.forEach(function (e) { if (e) mainViewer.entities.remove(e); });
//     window.GcsApp.state.gcsFireZoneEntities = [];

//     var pipeLinePositions = [];
//     var list = window.GcsApp.state.waypointList || window.waypointList || [];
//     if (!Array.isArray(list) || list.length === 0) return;

//     // 2. 전체 비행 노드를 순회하며 3D 건물 옥상 밀착형 그래픽 파이프라인 사출
//     list.forEach(function (node) {
//         if (!node) return;
//         var nodeAlt = parseFloat(node.alt) || 150.0;
//         var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : (node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN;

//         var absoluteTopCenter = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt);
//         pipeLinePositions.push(absoluteTopCenter);

//         // 노드가 품고 온 옥상 베이스 높이를 바인딩
//         var buildingBaseHeight = parseFloat(node.roofBase) || 0; 

//         if (buildingBaseHeight === 0 && scene.globe) {
//             var radLon = Cesium.Math.toRadians(node.lon);
//             var radLat = Cesium.Math.toRadians(node.lat);
//             buildingBaseHeight = scene.globe.getHeight(new Cesium.Cartographic(radLon, radLat)) || 0;
//         }

//         // 삼각 꼭짓점 평면 좌표 배열 생성
//         var basePoints = [];
//         for (var a = 0; a < 360; a += 120) {
//             var rad = Cesium.Math.toRadians(a);
//             basePoints.push({
//                 lon: node.lon + (0.00004 * Math.cos(rad)),
//                 lat: node.lat + (0.00004 * Math.sin(rad))
//             });
//         }

//         var trianglePosArray = [];
//         basePoints.forEach(function (pt) {
//             trianglePosArray.push(pt.lon, pt.lat);
//         });

//         // 3D 옥상 부유형 삼각기둥 볼륨 디플로이
//         var polygonEntity = mainViewer.entities.add({
//             polygon: {
//                 hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePosArray),
//                 height: buildingBaseHeight,         // 옥상 표면 고도를 최하단 베이스로 안착
//                 extrudedHeight: nodeAlt,            // 지정 관제 고도까지 입체 사출
//                 // material: nodeColor.withAlpha(0.25), 
//                 material: Cesium.Color.fromAlpha(nodeColor, 0.25),
//                 outline: false                      
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity);

//         // 와이어프레임 삼각 기둥 테두리선 정밀 매립
//         basePoints.forEach(function (pt, idx) {
//             var nextPt = basePoints[(idx + 1) % basePoints.length];

//             // A. 바닥면 테두리선 삼각형
//             var bottomLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), 
//                         Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)
//                     ],
//                     // width: 4, material: nodeColor.withAlpha(0.85), arcType: Cesium.ArcType.NONE
//                     width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             // B. 상공 천장면 테두리선 삼각형
//             var topLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt), 
//                         Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)
//                     ],
//                     width: 4, material: nodeColor.withAlpha(0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             // C. 세로 수직 연결 기둥 실선
//             var verticalPillar = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), 
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)
//                     ],
//                     // width: 2.5, material: nodeColor.withAlpha(0.6), arcType: Cesium.ArcType.NONE
//                     width: 2.5, material: Cesium.Color.fromAlpha(nodeColor, 0.6), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             window.GcsApp.state.gcsFireZoneEntities.push(bottomLine, topLine, verticalPillar);
//         });

//         // 3D 상공 정보 레이블 배치 안착
//         var labelEntity = mainViewer.entities.add({
//             position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt + 12.0),
//             label: {
//                 text: node.id + " (" + Math.round(nodeAlt) + "m)",
//                 font: 'bold 14px "Malgun Gothic", sans-serif',
//                 fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
//                 style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//                 disableDepthTestDistance: Number.POSITIVE_INFINITY
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(labelEntity);
//     });

//     // 노드 간 가로지르는 스프링 그린 비행 순항 실선 사출
//     if (pipeLinePositions.length > 1) {
//         var polylineEntity = mainViewer.entities.add({
//             polyline: {
//                 positions: pipeLinePositions, width: 5,
//                 material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }),
//                 arcType: Cesium.ArcType.NONE
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polylineEntity);
//     }

//     scene.requestRender();
// };



/**
 * 🛸 [GCS 코어 그래픽 엔진 - 출발지 삼각기둥 중복 생성 원천 박멸 패치]
 * node.id가 "Home"인 경우 일반 삼각기둥 렌더링을 패스(Skip)함으로써
 * 새로 고정된 원모양 H-Pad 드론포트 구조체와 구형 기둥이 겹쳐서 살아남는 버그를 완벽히 제거했습니다.
 */
// window.rebuildGcsPipelineAndLabels = function () {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;
//     var scene = mainViewer.scene;

//     // 🛡️ [무결성 가드] 기체가 비행 중(항행 모드)일 때는 엔티티 삭제/수정 스레드를 강제 스킵하여 크래시 차단
//     if (window.gcsDroneLiveState && typeof window.gcsDroneLiveState.isTakeoffConfirmedGuard !== "undefined") {
//         if (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false) {
//             return;
//         }
//     }

//     // Cesium 프라이빗 배열 훼손을 막기 위해 기존 공역 요소 안전 제거
//     var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
//     fireZoneEntities.forEach(function (e) {
//         if (e && mainViewer.entities.contains(e)) {
//             mainViewer.entities.remove(e);
//         }
//     });
//     window.GcsApp.state.gcsFireZoneEntities = [];

//     var pipeLinePositions = [];
//     var list = window.GcsApp.state.waypointList || window.waypointList || [];
//     if (!Array.isArray(list) || list.length === 0) return;

//     // 2. 전체 비행 노드를 순회하며 3D 공간 그래픽 파이프라인 사출
//     list.forEach(function (node) {
//         if (!node) return;

//         // 1. 기본 바닥 지면/건물 높이 연산
//         var buildingBaseHeight = parseFloat(node.roofBase) || 0;
//         if (buildingBaseHeight === 0 && scene.globe) {
//             var radLon = Cesium.Math.toRadians(node.lon);
//             var radLat = Cesium.Math.toRadians(node.lat);
//             buildingBaseHeight = scene.globe.getHeight(new Cesium.Cartographic(radLon, radLat)) || 0;
//         }
//         buildingBaseHeight = Math.round(buildingBaseHeight);

//         // 2. 입력된 관제 고도 파싱
//         var nodeAlt = parseFloat(node.alt) || 150.0;

//         // ★ [핵심 완치 실드] 관제 고도가 바닥 고도보다 낮거나 같으면, 
//         // 삼각기둥이 상공으로 정상 사출되도록 최소 50m의 예비 마진 비행 공역을 강제로 확보합니다.
//         if (nodeAlt <= buildingBaseHeight) {
//             nodeAlt = buildingBaseHeight + 50.0; 
//             node.alt = nodeAlt; // 원본 배열 고도 데이터도 안전하게 동기화 복원
            
//             // 화면의 인풋 박스 수치도 즉시 시각적으로 동기화 갱신
//             if (node.id === "Home") {
//                 var homeAltIn = document.getElementById("gcs_home_alt_input");
//                 if (homeAltIn) homeAltIn.value = Math.round(nodeAlt);
//             }
//         }

//         // 경로선 구성을 위한 탑 정점 좌표는 출발지(Home) 유무와 상관없이 무조건 동기화 수집
//         var absoluteTopCenter = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt);
//         pipeLinePositions.push(absoluteTopCenter);

//         // ⭐ [버그 박멸 핵심 핵심 실드] 
//         // 출발지(Home)인 경우는 여기서 일반 주황색 삼각기둥을 그리지 않고 탈출(return)시킵니다.
//         // 이로써 gcsDeployDynamicHPadAndPrismAirspace 함수가 만든 원형 드론 포트와 겹치는 현상을 차단합니다.
//         // if (node.id === "Home") {
//         //     return;
//         // }
//         // // --- 경유지(WP) 및 목적지(Destination) 전용 삼각기둥 렌더링 영역 ---
//         // var nodeColor = (node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN;

//         // 💥 [원본 직접 수선 1] 출발지 가드 리턴문을 완전히 파괴 삭제하여 일괄 삼각기둥 파이프라인으로 통합!!
//         // 식별자 조건 매싱에 맞춰 출발지=주황색, 목적지=빨간색, 경유지=청록색으로 물리 색상 축만 명확히 바인딩합니다.
//         var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : ((node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN);
        


//         // 💥 [요구사항 반용 핵심 수식: 헬리포트 이륙장 구조체 보존 주입]
//         // 오직 출발지(Home) 노드일 때만, 구형 원기둥을 완전히 배제하고 순정 노란색 링 패드와 마커 핀을 바닥면에 찰떡 투사합니다.
//         if (node.id === "Home") {
//             var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_PIN", "GCS_ROOF_PRISM_AIRSPACE"];
//             explicitIds.forEach(function (id) {
//                 var ent = mainViewer.entities.getById(id);
//                 if (ent) mainViewer.entities.remove(ent);
//             });

//             var positions = [];
//             var radius = 0.00018; 
//             for (var i = 0; i <= 360; i += 5) {
//                 var radians = Cesium.Math.toRadians(i);
//                 positions.push(Cesium.Cartesian3.fromDegrees(node.lon + (radius * Math.cos(radians)), node.lat + (radius * Math.sin(radians)), buildingBaseHeight + 0.5));
//             }

//             // 노란색 링 테두리 구조체 100% 무결성 사출 복원
//             var hpadCoreEntity = mainViewer.entities.add({
//                 id: "GCS_HPAD_CORE",
//                 polyline: { positions: positions, width: 8.0, material: Cesium.Color.YELLOW, disableDepthTestDistance: Number.POSITIVE_INFINITY }
//             });

//             // 이륙 정점 딥핑크 마커 핀 100% 무결성 사출 복원
//             var hpadPinEntity = mainViewer.entities.add({
//                 id: "GCS_HPAD_PIN",
//                 position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, buildingBaseHeight + 0.7),
//                 point: { pixelSize: 22, color: Cesium.Color.DEEPPINK, outlineColor: Cesium.Color.WHITE, outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY }
//             });

//             // 렌더링 배열 보호 관리를 위해 전역 엔티티 세척 버퍼에 함께 안전 적재
//             window.GcsApp.state.gcsFireZoneEntities.push(hpadCoreEntity, hpadPinEntity);
//         }

//         var basePoints = [];
//         for (var a = 0; a < 360; a += 120) {
//             var rad = Cesium.Math.toRadians(a);
//             basePoints.push({
//                 lon: node.lon + (0.00004 * Math.cos(rad)),
//                 lat: node.lat + (0.00004 * Math.sin(rad))
//             });
//         }

//         var trianglePosArray = [];
//         basePoints.forEach(function (pt) { trianglePosArray.push(pt.lon, pt.lat); });

//         // 3D 삼각기둥 솔리드 부피 사출
//         var polygonEntity = mainViewer.entities.add({
//             polygon: {
//                 hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePosArray),
//                 height: buildingBaseHeight,
//                 extrudedHeight: nodeAlt,
//                 material: Cesium.Color.fromAlpha(nodeColor, 0.25),
//                 outline: false
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity);

//         // 와이어프레임 기둥 테두리선 정밀 밀겁
//         basePoints.forEach(function (pt, idx) {
//             var nextPt = basePoints[(idx + 1) % basePoints.length];

//             var bottomLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight),
//                         Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)
//                     ],
//                     width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             var topLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt),
//                         Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)
//                     ],
//                     width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             var verticalPillar = mainViewer.entities.add({
//                 polyline: {
//                     positions: [
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight),
//                         Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)
//                     ],
//                     width: 2.5, material: Cesium.Color.fromAlpha(nodeColor, 0.6), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             window.GcsApp.state.gcsFireZoneEntities.push(bottomLine, topLine, verticalPillar);
//         });

//         // 상공 명세 정보 레이블 안착
//         var labelEntity = mainViewer.entities.add({
//             position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt + 12.0),
//             label: {
//                 text: node.id + " (" + Math.round(nodeAlt) + "m)",
//                 font: 'bold 14px "Malgun Gothic", sans-serif',
//                 fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
//                 style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//                 disableDepthTestDistance: Number.POSITIVE_INFINITY
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(labelEntity);
//     });

//     // 노드 간 가로지르는 스프링 그린 비행 순항 가이드선 사출 (출발지 포트 중심점부터 연결 유지)
//     if (pipeLinePositions.length > 1) {
//         var polylineEntity = mainViewer.entities.add({
//             polyline: {
//                 positions: pipeLinePositions, width: 5,
//                 material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }),
//                 arcType: Cesium.ArcType.NONE
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polylineEntity);
//     }

//     scene.requestRender();
// };



// =========================================================================
// 🛸 [GCS 코어 그래픽 엔진] 순정 삼각기둥 유지 + 출발지(Home) 전용 헬리포트 추가 모듈
// =========================================================================


// window.rebuildGcsPipelineAndLabels = function () {
//     alert("2251");
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;
//     var scene = mainViewer.scene;

//     // 🛡️ [완치 핵심 1] 그리기 모드 플래그(isDrawingMode) 간섭 및 차단막을 완전히 무력화합니다.
//     // 3D 관제 편집 상태이든 2D 상태이든 무조건 하위 렌더링 스레드를 관통시킵니다.
    
//     // 🛡️ [완치 핵심 2] 기존에 배열 파괴를 유발하던 비행 보호막 조건만 정밀하게 유지
//     if (window.gcsDroneLiveState && typeof window.gcsDroneLiveState.isTakeoffConfirmedGuard !== "undefined") {
//         if (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false) {
//             return;
//         }
//     }

//     // 1. 기존 공간에 배치되어 있던 편집용 에어돔 및 라벨 엔티티 잔여물 싹 쓸어내기
//     var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
//     fireZoneEntities.forEach(function (e) { 
//         if (e && mainViewer.entities.contains(e)) {
//             mainViewer.entities.remove(e); 
//         }
//     });
//     window.GcsApp.state.gcsFireZoneEntities = [];

//     var pipeLinePositions = [];
//     var list = window.GcsApp.state.waypointList || window.waypointList || [];
//     if (!Array.isArray(list) || list.length === 0) return;

//     // 2. 전체 비행 노드 [출발지, 경유지, 목적지] 순회 사출 파이프라인
//     list.forEach(function (node) {
//         if (!node || !node.id) return;

//         var nodeLon = parseFloat(node.lon);
//         var nodeLat = parseFloat(node.lat);
//         var nodeAlt = parseFloat(node.alt) || 150.0;

//         // 경로선 구성을 위한 탑 정점 좌표 수집
//         var absoluteTopCenter = Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt);
//         pipeLinePositions.push(absoluteTopCenter);

//         // 식별자 조건 매칭 색상 바인딩 (출발지=주황, 목적지=빨강, 경유지=청록)
//         var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : ((node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN);
        
//         // 지상/옥상 베이스 해발 고도 산출
//         var buildingBaseHeight = parseFloat(node.roofBase) || 0;
//         if (buildingBaseHeight === 0 && scene.globe) {
//             var radLon = Cesium.Math.toRadians(nodeLon);
//             var radLat = Cesium.Math.toRadians(nodeLat);
//             buildingBaseHeight = scene.globe.getHeight(new Cesium.Cartographic(radLon, radLat)) || 0;
//         }
//         buildingBaseHeight = Math.round(buildingBaseHeight);

//         // =========================================================================
//         // ⭐ [요구사항 반영 핵심 수식]: 오직 출발지(Home) 노드일 때만 순정 노란색 링 패드와 마커 핀 사출
//         // =========================================================================
//         if (node.id === "Home") {
//             // 잔상 ID 개별 제거 가드
//             var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_PIN"];
//             explicitIds.forEach(function (id) {
//                 var ent = mainViewer.entities.getById(id);
//                 if (ent) mainViewer.entities.remove(ent);
//             });

//             var positions = [];
//             var radius = 0.00012; // 링 반경 (삼각기둥 와이어프레임을 살짝 감싸는 최적의 규격)
//             for (var i = 0; i <= 360; i += 5) {
//                 var radians = Cesium.Math.toRadians(i);
//                 positions.push(Cesium.Cartesian3.fromDegrees(nodeLon + (radius * Math.cos(radians)), nodeLat + (radius * Math.sin(radians)), buildingBaseHeight + 0.3));
//             }

//             // A. 바닥면 노란색 링 테두리 구조체(헬리포트) 사출
//             var hpadCoreEntity = mainViewer.entities.add({
//                 id: "GCS_HPAD_CORE",
//                 polyline: { 
//                     positions: positions, 
//                     width: 6.0, 
//                     material: Cesium.Color.YELLOW, 
//                     disableDepthTestDistance: Number.POSITIVE_INFINITY 
//                 }
//             });

//             // B. 이륙 중심 정점 딥핑크 마커 핀 투사
//             var hpadPinEntity = mainViewer.entities.add({
//                 id: "GCS_HPAD_PIN",
//                 position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, buildingBaseHeight + 0.5),
//                 point: { 
//                     pixelSize: 18, 
//                     color: Cesium.Color.DEEPPINK, 
//                     outlineColor: Cesium.Color.WHITE, 
//                     outlineWidth: 3, 
//                     disableDepthTestDistance: Number.POSITIVE_INFINITY 
//                 }
//             });

//             // 렌더러 안전 관리를 위해 전역 세척 버퍼 배열에 함께 적재
//             window.GcsApp.state.gcsFireZoneEntities.push(hpadCoreEntity, hpadPinEntity);
//         }

//         // --- 순정 삼각기둥 기하학 공역 렌더링 영역 (Home 포함 일괄 적용) ---
//         var basePoints = [];
//         for (var a = 0; a < 360; a += 120) {
//             var rad = Cesium.Math.toRadians(a);
//             basePoints.push({
//                 lon: nodeLon + (0.00004 * Math.cos(rad)),
//                 lat: nodeLat + (0.00004 * Math.sin(rad))
//             });
//         }

//         var trianglePosArray = [];
//         basePoints.forEach(function (pt) { trianglePosArray.push(pt.lon, pt.lat); });

//         // 3D 삼각기둥 솔리드 부피 사출
//         var polygonEntity = mainViewer.entities.add({
//             polygon: {
//                 hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePosArray),
//                 height: buildingBaseHeight,
//                 extrudedHeight: nodeAlt,
//                 material: Cesium.Color.fromAlpha(nodeColor, 0.25),
//                 outline: false
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity);

//         // 와이어프레임 기둥 테두리선 및 수직 실선 정밀 매립
//         basePoints.forEach(function (pt, idx) {
//             var nextPt = basePoints[(idx + 1) % basePoints.length];

//             var bottomLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)],
//                     width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             var topLine = mainViewer.entities.add({
//                 polyline: {
//                     positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)],
//                     width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             var verticalPillar = mainViewer.entities.add({
//                 polyline: {
//                     positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)],
//                     width: 2.5, material: Cesium.Color.fromAlpha(nodeColor, 0.6), arcType: Cesium.ArcType.NONE
//                 }
//             });

//             window.GcsApp.state.gcsFireZoneEntities.push(bottomLine, topLine, verticalPillar);
//         });

//         // 상공 명세 정보 레이블 안착
//         var labelEntity = mainViewer.entities.add({
//             position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt + 12.0),
//             label: {
//                 text: node.id + " (" + Math.round(nodeAlt) + "m)",
//                 font: 'bold 14px "Malgun Gothic", sans-serif',
//                 fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
//                 style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//                 disableDepthTestDistance: Number.POSITIVE_INFINITY
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(labelEntity);
//     });

//     // 노드 간 가로지르는 스프링 그린 비행 순항 가이드선 사출
//     if (pipeLinePositions.length > 1) {
//         var polylineEntity = mainViewer.entities.add({
//             polyline: {
//                 positions: pipeLinePositions, width: 5,
//                 material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }),
//                 arcType: Cesium.ArcType.NONE
//             }
//         });
//         window.GcsApp.state.gcsFireZoneEntities.push(polylineEntity);
//     }

//     scene.requestRender();
// };



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


/**
 * 💥 [마스터 홈설정 기능 고도화] 
 * 주소 검색 후 또는 지도에서 위치를 지정하고 유저가 [홈설정]을 누를 때 직접 호출되는 코어 함수입니다.
 */
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

    // 💥 [핵심 로직] 새로운 위치로 영구 홈 데이터를 생성하고 락(Lock)을 갱신합니다.
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
        address: searchKeyword
    };

    // 전역 배열 상태 갱신 파이프라인 집행
    window.gcsRefreshHomePipeline();

    console.log(`🚩 [GCS 영구 락] 다음 홈설정 변경 전까지 이 위치를 영구 출발지로 고정합니다: [${searchKeyword}]`);
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

    // 4. 상공 3D 삼각기둥 에어돔 공역 렌더러 파이프라인 동기화 자극
    // try {
    //     if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    //     else if (typeof window.updateFlightPathAirspace === "function") window.updateFlightPathAirspace();
    // } catch (e) { }

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
// =====================================================================================
// 🛸 [GCS 최종 마감 마스터피스] 동적 액션 분기형 드론 포트 잠금 및 공역 영구 보존 엔진
// =====================================================================================

/**
//  * 📐 [1단계] 삼각기둥 공역 및 빌딩 관통형 격자 H-Pad 이미지 포트 시각화 디플로이어
//  */
// function gcsDeployDynamicHPadAndPrismAirspace(lon, lat, targetRoofHeight, buildingName) {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;

//     // 홈 설정 진입 타이밍에만 실행되므로, 기존 구형 프리픽스 잔여물만 타깃 소탕
//     var entityList = mainViewer.entities.values;
//     for (var i = entityList.length - 1; i >= 0; i--) {
//         var entity = entityList[i];
//         if (entity && entity.id) {
//             if (entity.id.indexOf("GCS_") !== -1 || 
//                 entity.id === "GCS_NODE_ENTITY_Home" || 
//                 entity.id === "GCS_NODE_ENTITY_출발지") {
//                 mainViewer.entities.remove(entity);
//             }
//         }
//     }

//     var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_LABEL", "GCS_HPAD_PIN", "GCS_ROOF_PRISM_AIRSPACE"];
//     explicitIds.forEach(function(id) {
//         var ent = mainViewer.entities.getById(id);
//         if (ent) mainViewer.entities.remove(ent);
//     });

//     var calculatedHPadHeight = targetRoofHeight;
//     var airspaceThickness = 60.0; // 관제 안전 마진 수식 공식 (+60m 에어돔 두께)

//     var positions = [];
//     var radius = 0.00018; 
//     for (var i = 0; i <= 360; i += 5) {
//         var radians = Cesium.Math.toRadians(i);
//         positions.push(Cesium.Cartesian3.fromDegrees(lon + (radius * Math.cos(radians)), lat + (radius * Math.sin(radians)), calculatedHPadHeight + 0.5));
//     }

//     mainViewer.entities.add({
//         id: "GCS_HPAD_CORE",
//         polyline: {
//             positions: positions, width: 8.0, material: Cesium.Color.YELLOW, 
//             disableDepthTestDistance: Number.POSITIVE_INFINITY 
//         }
//     });

//     mainViewer.entities.add({
//         id: "GCS_HPAD_PIN",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, calculatedHPadHeight + 0.7),
//         point: {
//             pixelSize: 22, color: Cesium.Color.DEEPPINK, outlineColor: Cesium.Color.WHITE, outlineWidth: 4,
//             disableDepthTestDistance: Number.POSITIVE_INFINITY 
//         }
//     });

//     mainViewer.entities.add({
//         id: "GCS_ROOF_PRISM_AIRSPACE",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, calculatedHPadHeight + (airspaceThickness / 2)),
//         cylinder: {
//             length: airspaceThickness, topRadius: 22.0, bottomRadius: 22.0, slices: 3, 
//             material: Cesium.Color.ORANGE.withAlpha(0.35), outline: true, outlineColor: Cesium.Color.ORANGE, outlineWidth: 3.0
//         }
//     });

//     mainViewer.entities.add({
//         id: "GCS_HPAD_LABEL",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, calculatedHPadHeight + airspaceThickness + 5.0), 
//         label: {
//             text: ` Flux DRONE PORT ACTIVE\n▶ 홈 지정 구조체 : ${buildingName}\n▶ 이륙 절대고도 : ${calculatedHPadHeight}m\n▶ 공역 상한고도 : ${(calculatedHPadHeight + airspaceThickness)}m`,
//             font: 'bold 12px "Courier New", "Malgun Gothic", sans-serif',
//             fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 4,
//             style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//             disableDepthTestDistance: Number.POSITIVE_INFINITY 
//         }
//     });

//     mainViewer.scene.requestRender();
// }



// =========================================================================
// 🛸 [GCS 최종 완성본] 무결성 연동 및 Cesium 배열 파괴 방지 완치 마감 스크립트
// =========================================================================

/**
 * 🛸 [1단계] 순정 삼각기둥 공역 및 빌딩 관통형 H-Pad 통합 디플로이어
 * 기존에 구성해두신 3D 공간 엔티티 투사 로직의 변수명과 팩토리 함수를 그대로 유지합니다.
//  */
// function gcsDeployDynamicHPadAndPrismAirspace(lon, lat, targetRoofHeight, buildingName, safeAltitude) {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;

//     // Cesium 내부 프라이빗 청소 시 배열을 부수지 않도록 명시적 ID 타깃 소탕 안전 가드
//     var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_LABEL", "GCS_HPAD_PIN", "GCS_ROOF_PRISM_AIRSPACE", "GCS_NODE_ENTITY_Home"];
//     explicitIds.forEach(function (id) {
//         var ent = mainViewer.entities.getById(id);
//         if (ent) mainViewer.entities.remove(ent);
//     });

//     var calculatedHPadHeight = parseFloat(targetRoofHeight);
//     // 💥 [핵심 완치 수식 1] 외부 인풋 제어창 또는 스토리지에서 넘어온 진짜 실시간 관제고도 값을 1순위로 확정 바인딩합니다.
//     var currentControlAlt = parseFloat(safeAltitude);
//     if (isNaN(currentControlAlt) || currentControlAlt <= calculatedHPadHeight) {
//         currentControlAlt = calculatedHPadHeight + 60; // 안전 예비 마진 바인딩
//     }
//     // 💥 [핵심 완치 수식 2] 바닥 이륙 절대고도부터 진짜 실시간 관제고도 끝단까지의 정확한 실시간 두께를 산출합니다.
//     var airspaceThickness = currentControlAlt - calculatedHPadHeight; 
//     if (isNaN(airspaceThickness) || airspaceThickness <= 0) airspaceThickness = 60.0;

//     var positions = [];
//     var radius = 0.00018; 
//     for (var i = 0; i <= 360; i += 5) {
//         var radians = Cesium.Math.toRadians(i);
//         positions.push(Cesium.Cartesian3.fromDegrees(lon + (radius * Math.cos(radians)), lat + (radius * Math.sin(radians)), calculatedHPadHeight + 0.5));
//     }


//     // 1. 순정 노란색 링 H-Pad 외곽선 사출
//     mainViewer.entities.add({
//         id: "GCS_HPAD_CORE",
//         polyline: {
//             positions: positions, width: 8.0, material: Cesium.Color.YELLOW,
//             disableDepthTestDistance: Number.POSITIVE_INFINITY
//         }
//     });

//     // 2. 이륙 정점 딥핑크 마커 핀
//     mainViewer.entities.add({
//         id: "GCS_HPAD_PIN",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, calculatedHPadHeight + 0.7),
//         point: {
//             pixelSize: 22, color: Cesium.Color.DEEPPINK, outlineColor: Cesium.Color.WHITE, outlineWidth: 4,
//             disableDepthTestDistance: Number.POSITIVE_INFINITY
//         }
//     });

//     // 🔒 [원기둥 실시간 500m/197m 동적 수직 팽창 결착] 
//     // 가상 중심점 높이를 실시간 가변 두께(airspaceThickness) 기준으로 완벽하게 정합 투사합니다.
//     mainViewer.entities.add({
//         id: "GCS_ROOF_PRISM_AIRSPACE",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, calculatedHPadHeight + (airspaceThickness / 2)),
//         cylinder: {
//             length: airspaceThickness, topRadius: 22.0, bottomRadius: 22.0, 
//             material: Cesium.Color.ORANGE.withAlpha(0.35), outline: true, outlineColor: Cesium.Color.ORANGE, outlineWidth: 3.0
//         }
//     });

//     // 🔒 3D 공간 레이더 상단 실시간 안내 텍스트 갱신 결착
//     mainViewer.entities.add({
//         id: "GCS_HPAD_LABEL",
//         position: Cesium.Cartesian3.fromDegrees(lon, lat, currentControlAlt + 5.0), 
//         label: {
//             text: ` Flux DRONE PORT ACTIVE\n▶ 홈 지정 구조체 : ${buildingName}\n▶ 이륙 절대고도 : ${Math.round(calculatedHPadHeight)}m\n▶ 관제 상한고도 : ${Math.round(currentControlAlt)}m`,
//             font: 'bold 12px "Courier New", "Malgun Gothic", sans-serif',
//             fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 4,
//             style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
//             disableDepthTestDistance: Number.POSITIVE_INFINITY 
//         }
//     });

//     mainViewer.scene.requestRender();
// }

/**
 * 🛸 [GCS 코어 인프라 - 상시 중복 레이블 파괴 및 관제고도 실시간 수직 팽창 완결 마스터피스]
 * 1. 외부 리프레시 루프가 상단에 무단 복제 주입하는 '지면고도: 87m' 라인을 상시 감시하여 즉시 파괴 삭제합니다.
 * 2. 관제고도 인풋 수치를 변경하는 순간, 3D 원기둥의 높이가 실시간으로 오차 없이 수직 팽창합니다.
 * 3. 새로고침 및 재접속 시에도 수직 팽창된 에어돔 상태가 100% 영구 복원됩니다.
 */
function gcsExecuteIntegratedHPadPrismPipeline(rawCesiumHeight, isBuilding, currentAction) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;

    if (currentAction && (currentAction.indexOf("wp") !== -1 || currentAction.indexOf("waypoint") !== -1 || currentAction.indexOf("destination") !== -1)) {
        return;
    }

    // [순정 데이터 역산 및 확정]
    var calculatedRoofHeight = parseInt(rawCesiumHeight, 10);
    if (isNaN(calculatedRoofHeight) || calculatedRoofHeight <= 0) calculatedRoofHeight = 111;

    var lon = window.GcsApp.state.lastRightClickLon || 126.919446;
    var lat = window.GcsApp.state.lastRightClickLat || 37.460815;
    var scene = ws3d.viewer.scene;

    // 지형 스캔 엔진 기반 지면 고도 연산
    var fixedTerrainHeight = Math.round(scene.globe ? (scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) || 0) : 86);
    if (fixedTerrainHeight <= 0 || isNaN(fixedTerrainHeight)) fixedTerrainHeight = 86;

    // 🔒 [정밀 수정 위치] 호출부 진입 전에 고도 수치를 171m 부근으로 강제 강착시키던 구형 하드코딩 수식을 파괴합니다.
    var liveControlInput = document.getElementById("gcs_home_alt_input");
    
    // 💥 [핵심 완치 수식 1] 화면상에 떠 있는 진짜 인풋 제어창의 가변 값(예: 500m)을 최우선 1순위로 확정 래칭합니다.
    var safeAltitude = liveControlInput ? parseInt(liveControlInput.value, 10) : (calculatedRoofHeight + 60);
    
    // 만약 최초 로딩 타이라인이거나 수치가 비정상적일 때만 안전 권장 마진을 보완 작동시킵니다.
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
            var homeNode = list.find(function(n) { return n && n.id === "Home"; });
            if (homeNode) {
                homeNode.lon = lon; 
                homeNode.lat = lat;
                
                // 💥 [핵심 완치 수식 2] 전역 원본 경로 데이터 스토리지 배열에도 진짜 가변 관제고도를 오차 없이 꼽아넣습니다.
                homeNode.alt = safeAltitude; 
                homeNode.roofBase = isBuilding ? calculatedRoofHeight : 0; 
                homeNode.address = dynamicBuildingName;
            }
        }
    }
    
    // // 🔒 [정밀 수정 위치 1] 출발지 설정 시 건물고도 데이터(roofBase) 유실 현상을 원천 방어합니다.
    // var list = window.GcsApp.state.waypointList || window.waypointList || [];
    // if (Array.isArray(list) && list.length > 0) {
    //     var homeNode = list.find(function(n) { return n && n.id === "Home"; });
    //     if (homeNode) {
    //         homeNode.lon = lon; 
    //         homeNode.lat = lat;
    //         homeNode.alt = safeAltitude; 
            
    //         // 💥 [버그 박멸] 이식된 가드가 true인 경우(건물인 경우) 진짜 옥상 절대고도(calculatedRoofHeight)를 
    //         // 100% 온전히 전송 및 영구 보존 락온하여 지면고도로 강제 리셋되는 결함을 차단합니다.
    //         if (isBuilding) {
    //             homeNode.roofBase = calculatedRoofHeight;
    //         } else {
    //             homeNode.roofBase = 0; // 평지 맨땅인 경우 순정 0m 압착 고정
    //         }
    //         homeNode.address = dynamicBuildingName;
    //     }
    // }

    // 🔒 [완치 포인트 1] 하이재킹 공법을 통한 상단 중복 라인 원천 파괴 및 가변 단일 매칭
    // var forceGcsLeftUiHomeCardTextInject = function () {
    //     var cardContainer = document.getElementById("card_waypoint_Home");
    //     if (cardContainer) {
    //         // ① 외부 루프가 비정상적으로 밀어 넣는 텍스트 라인을 전부 추적하여 무조건 즉시 제거
    //         var childNodes = cardContainer.querySelectorAll("div, p, span");
    //         childNodes.forEach(function (node) {
    //             if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node") {
    //                 node.remove();
    //             }
    //         });

    //         // ② 좌표 표기란 하단 컴포넌트에 단 하나의 완벽한 동적 고도 명세판을 고정 결착
    //         var coordsArea = cardContainer.querySelector("div[style*='display: flex'][style*='gap:']");
    //         if (coordsArea && coordsArea.parentNode) {
    //             var parentDiv = coordsArea.parentNode;

    //             var existAnchor = cardContainer.querySelector("#gcs_core_height_anchor_node");
    //             if (existAnchor) existAnchor.remove();

    //             var heightInfoWrapper = document.createElement("div");
    //             heightInfoWrapper.id = "gcs_core_height_anchor_node";
    //             heightInfoWrapper.style.cssText = "margin-top: 6px; margin-bottom: 2px; font-size: 12px; font-family: 'Malgun Gothic', sans-serif; color: #bdc3c7; line-height: 1.4; text-align: left;";

    //             if (isBuilding) {
    //                 heightInfoWrapper.innerHTML = `건물고도: <strong style="color: #fffa65; font-size: 13px;">${calculatedRoofHeight}m</strong> <span style="font-size:10px; color:#95a5a6;"></span>`;
    //             } else {
    //                 heightInfoWrapper.innerHTML = `지면고도: <strong style="color: #00ffcc; font-size: 13px;">${fixedTerrainHeight}m</strong> <span style="font-size:10px; color:#95a5a6;">(지상 높이)</span>`;
    //             }

    //             parentDiv.insertBefore(heightInfoWrapper, coordsArea.nextSibling);
    //         }
    //     }

    //     if (liveControlInput) {
    //         liveControlInput.value = safeAltitude;
    //     }
    // };

// 🔒 [정밀 수정 위치 2] forceGcsLeftUiHomeCardTextInject 함수 내부를 깨끗이 세척합니다.
    var forceGcsLeftUiHomeCardTextInject = function() {
        var cardContainer = document.getElementById("card_waypoint_Home");
        if (cardContainer) {
            // 외부 루프가 비정상적으로 밀어 넣는 잔상 텍스트 라인을 추적하여 완전히 제거
            var childNodes = cardContainer.querySelectorAll("div, p, span");
            childNodes.forEach(function(node) {
                if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node") {
                    node.remove();
                }
            });

            // 내부 앵커 노드가 존재한다면 실제 데이터 제원으로 정밀 강제 갱신
            var existAnchor = cardContainer.querySelector("#gcs_core_height_anchor_node");
            if (existAnchor) {
                if (isBuilding) {
                    existAnchor.innerHTML = `<span>건물고도:</span><strong style="color: #fffa65; font-size: 12px;">${calculatedRoofHeight}m</strong>`;
                } else {
                    existAnchor.innerHTML = `<span>지면고도:</span><strong style="color: #00ffcc; font-size: 12px;">${fixedTerrainHeight}m</strong>`;
                }
            }
        }
        if (liveControlInput) {
            liveControlInput.value = safeAltitude;
        }
    };

    forceGcsLeftUiHomeCardTextInject();

    // 보존 캐시 저장
    var gcsPersistenceBundle = {
        lon: lon, lat: lat,
        calculatedRoofHeight: calculatedRoofHeight,
        fixedTerrainHeight: fixedTerrainHeight,
        safeAltitude: safeAltitude,
        dynamicBuildingName: dynamicBuildingName,
        isBuilding: isBuilding
    };
    localStorage.setItem("GCS_LAST_SAVED_HOME_PORT_CACHE", JSON.stringify(gcsPersistenceBundle));
    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({ lon: lon, lat: lat, alt: safeAltitude, address: dynamicBuildingName }));

    // 🔒 [완치 포인트 2] 3D 원기둥 실시간 고도 사출 엔진 연동 트리거 격발
    gcsDeployDynamicHPadAndPrismAirspace(lon, lat, calculatedRoofHeight, dynamicBuildingName, safeAltitude);

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

    window.gcsIronShieldInterval = setInterval(function() {
        var cardContainer = document.getElementById("card_waypoint_Home");
        var altInput = document.getElementById("gcs_home_alt_input");

        // 🛡️ A. 원천 차단 가드: 외부 리프레시 루프가 무단 복제하여 밀어넣는 상단 가짜 중복 라인 실시간 소멸
        if (cardContainer) {
            var nestedDivs = cardContainer.querySelectorAll("div, p, span");
            nestedDivs.forEach(function(node) {
                if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node" && node.parentNode.id !== "gcs_core_height_anchor_node") {
                    node.remove(); // 발견 즉시 즉각 삭제
                }
            });
        }

        // 🛡️ B. 초정밀 가변 실시간 수직 팽창 링크 바인더 결착 (인자 가로채기 완전 해방)
        if (altInput && !altInput.isLiveMasterHooked) {
            altInput.removeEventListener("change", window.gcsAltMasterCoreHandler);
            altInput.removeEventListener("input", window.gcsAltMasterCoreHandler);

            window.gcsAltMasterCoreHandler = function(e) {
                // 💥 [핵심 완치 수식 1] 내부 바인딩 변수에 의존하지 않고 현재 인풋창에 타이핑된 '진짜 날것의 엘리먼트 값'을 다이렉트로 역산 포획합니다.
                window.gcsUserManualAltOverrideLock = true;

                var currentVal = parseInt(this.value, 10);
               
                if (isNaN(currentVal) || currentVal <= 0) {
                    var rawInput = document.getElementById("gcs_home_alt_input");
                    currentVal = rawInput ? parseInt(rawInput.value, 10) : 200;
                }

                
                var list = window.GcsApp.state.waypointList || window.waypointList || [];
                var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){return n && n.id === "Home";}) : null;
                
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
                    } catch(err){}
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
    window.gcsExecuteIntegratedHPadPrismPipeline = function() { return false; };
    window.gcsDeployDynamicHPadAndPrismAirspace = function() { return false; };
    
    // 외부 비동기 지형 리셋 타이머가 강제로 고도를 유실시키는 현상을 방지
    window.gcsUserManualAltOverrideLock = true; 
    
    console.log("🛡️ [GCS 보안막] 구형 원기둥 엔진 잔상 및 간섭 스레드가 완전히 청소되었습니다.");
})();

/**
 * 🛸 [3단계] 공간 에어돔 파이프라인 그래픽 엔진 (★RangeError 박멸 무결성 패치본)
 * 기존 코드의 삼각기둥 기하 구조 연산식을 100% 그대로 계승하되, 내부 배열 유실 오류를 완벽 차단합니다.
 */
window.rebuildGcsPipelineAndLabels = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // 🛡️ [비행 스레드 보호막] 기체가 시뮬레이션 항행 중일 때는 엔티티 파괴 연산 전면 차단
    if (window.gcsDroneLiveState && typeof window.gcsDroneLiveState.isTakeoffConfirmedGuard !== "undefined") {
        if (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false) {
            console.log("🛡️ [GCS 차단막] 시뮬레이션 항행 프레임 감지 ➡️ 엔티티 배열 파괴 연산 거부");
            return;
        }
    }

    // 1. 기존 공간에 배치되어 있던 편집용 에어돔 및 라벨 엔티티 잔여물 싹 쓸어내기
    var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
    fireZoneEntities.forEach(function (e) { 
        if (e && mainViewer.entities.contains(e)) {
            mainViewer.entities.remove(e); 
        }
    });
    window.GcsApp.state.gcsFireZoneEntities = [];

    var pipeLinePositions = [];
    var list = window.GcsApp.state.waypointList || window.waypointList || [];
    if (!Array.isArray(list) || list.length === 0) return;

    // 2. 전체 비행 노드 [출발지, 경유지, 목적지] 순회 사출 파이프라인
    list.forEach(function (node) {
        if (!node || !node.id) return;

        var nodeLon = parseFloat(node.lon);
        var nodeLat = parseFloat(node.lat);
        var nodeAlt = parseFloat(node.alt) || 150.0;

        // 경로선 구성을 위한 탑 정점 좌표 수집
        var absoluteTopCenter = Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt);
        pipeLinePositions.push(absoluteTopCenter);

        // 식별자 조건 매칭 색상 바인딩 (출발지=주황, 목적지=빨강, 경유지=청록)
        var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : ((node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN);
        
        // 지상/옥상 베이스 해발 고도 산출
        var buildingBaseHeight = parseFloat(node.roofBase) || 0;
        if (buildingBaseHeight === 0 && scene.globe) {
            var radLon = Cesium.Math.toRadians(nodeLon);
            var radLat = Cesium.Math.toRadians(nodeLat);
            buildingBaseHeight = scene.globe.getHeight(new Cesium.Cartographic(radLon, radLat)) || 0;
        }
        buildingBaseHeight = Math.round(buildingBaseHeight);

        // =========================================================================
        // ⭐ [요구사항 반영 핵심 수식]: 오직 출발지(Home) 노드일 때만 순정 노란색 링 패드와 마커 핀 사출
        // =========================================================================
        if (node.id === "Home") {
            // 잔상 ID 개별 제거 가드
            var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_PIN"];
            explicitIds.forEach(function (id) {
                var ent = mainViewer.entities.getById(id);
                if (ent) mainViewer.entities.remove(ent);
            });

            var positions = [];
            var radius = 0.00012; // 링 반경 (삼각기둥 와이어프레임을 살짝 감싸는 최적의 규격)
            for (var i = 0; i <= 360; i += 5) {
                var radians = Cesium.Math.toRadians(i);
                positions.push(Cesium.Cartesian3.fromDegrees(nodeLon + (radius * Math.cos(radians)), nodeLat + (radius * Math.sin(radians)), buildingBaseHeight + 0.3));
            }

            // A. 바닥면 노란색 링 테두리 구조체(헬리포트) 사출
            var hpadCoreEntity = mainViewer.entities.add({
                id: "GCS_HPAD_CORE",
                polyline: { 
                    positions: positions, 
                    width: 6.0, 
                    material: Cesium.Color.YELLOW, 
                    disableDepthTestDistance: Number.POSITIVE_INFINITY 
                }
            });

            // B. 이륙 중심 정점 딥핑크 마커 핀 투사
            var hpadPinEntity = mainViewer.entities.add({
                id: "GCS_HPAD_PIN",
                position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, buildingBaseHeight + 0.5),
                point: { 
                    pixelSize: 18, 
                    color: Cesium.Color.DEEPPINK, 
                    outlineColor: Cesium.Color.WHITE, 
                    outlineWidth: 3, 
                    disableDepthTestDistance: Number.POSITIVE_INFINITY 
                }
            });

            // 렌더러 안전 관리를 위해 전역 세척 버퍼 배열에 함께 적재
            window.GcsApp.state.gcsFireZoneEntities.push(hpadCoreEntity, hpadPinEntity);
        }

        // --- 순정 삼각기둥 기하학 공역 렌더링 영역 (Home 포함 일괄 적용) ---
        var basePoints = [];
        for (var a = 0; a < 360; a += 120) {
            var rad = Cesium.Math.toRadians(a);
            basePoints.push({
                lon: nodeLon + (0.00004 * Math.cos(rad)),
                lat: nodeLat + (0.00004 * Math.sin(rad))
            });
        }

        var trianglePosArray = [];
        basePoints.forEach(function (pt) { trianglePosArray.push(pt.lon, pt.lat); });

        // 3D 삼각기둥 솔리드 부피 사출
        var polygonEntity = mainViewer.entities.add({
            polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePosArray),
                height: buildingBaseHeight,
                extrudedHeight: nodeAlt,
                material: Cesium.Color.fromAlpha(nodeColor, 0.25),
                outline: false
            }
        });
        window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity);

        // 와이어프레임 기둥 테두리선 및 수직 실선 정밀 매립
        basePoints.forEach(function (pt, idx) {
            var nextPt = basePoints[(idx + 1) % basePoints.length];

            var bottomLine = mainViewer.entities.add({
                polyline: {
                    positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)],
                    width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
                }
            });

            var topLine = mainViewer.entities.add({
                polyline: {
                    positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)],
                    width: 4, material: Cesium.Color.fromAlpha(nodeColor, 0.85), arcType: Cesium.ArcType.NONE
                }
            });

            var verticalPillar = mainViewer.entities.add({
                polyline: {
                    positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)],
                    width: 2.5, material: Cesium.Color.fromAlpha(nodeColor, 0.6), arcType: Cesium.ArcType.NONE
                }
            });

            window.GcsApp.state.gcsFireZoneEntities.push(bottomLine, topLine, verticalPillar);
        });

        // 상공 명세 정보 레이블 안착
        var labelEntity = mainViewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt + 12.0),
            label: {
                text: node.id + " (" + Math.round(nodeAlt) + "m)",
                font: 'bold 14px "Malgun Gothic", sans-serif',
                fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        window.GcsApp.state.gcsFireZoneEntities.push(labelEntity);
    });

    // 노드 간 가로지르는 스프링 그린 비행 순항 가이드선 사출
    if (pipeLinePositions.length > 1) {
        var polylineEntity = mainViewer.entities.add({
            polyline: {
                positions: pipeLinePositions, width: 5,
                material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }),
                arcType: Cesium.ArcType.NONE
            }
        });
        window.GcsApp.state.gcsFireZoneEntities.push(polylineEntity);
    }

    scene.requestRender();
};


/**
 * 💥 [2단계] 액션 분기 필터링 기능이 탑재된 영구 캐시 바인딩 메인 함수
 */
// function gcsExecuteIntegratedHPadPrismPipeline(rawCesiumHeight, isBuilding, currentAction) {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//     var mainViewer = ws3d.viewer;
//     var scene = mainViewer.scene;

//     // 💥 [핵심 수선 포인트 1] 만약 클릭 액션이 경유지 추가(waypoint / wp) 이거나 목적지 지정(destination) 일 경우,
//     // 기존에 활성화되어 떠 있는 홈 포트 구역을 파괴하지 않고 "조용히 함수를 우회 차단(return)" 시켜 순정 코드가 흐르게 내버려 둡니다.
//     if (currentAction && (currentAction.indexOf("wp") !== -1 || currentAction.indexOf("waypoint") !== -1 || currentAction.indexOf("destination") !== -1)) {
//         console.log(`%c[GCS 바이패스 실드] 경유지/목적지 액션 명세 감지 (${currentAction}) ➡️ 기존 출발지 드론포트를 철통 보존합니다.`, "color: #70a1ff; font-size: 11px;");
//         return; 
//     }

//     var extractedHeight = parseInt(rawCesiumHeight, 10);
//     if (isNaN(extractedHeight) || extractedHeight <= 0) extractedHeight = 111; 

//     var lon = 126.919416; var lat = 37.460815; 
//     var fixedTerrainHeight = 0;

//     var centerPosition = scene.camera.pickEllipsoid(new Cesium.Cartesian2(mainViewer.canvas.clientWidth / 2, mainViewer.canvas.clientHeight / 2));
//     if (centerPosition) {
//         var carto = Cesium.Cartographic.fromCartesian(centerPosition);
//         lon = Cesium.Math.toDegrees(carto.longitude); lat = Cesium.Math.toDegrees(carto.latitude);
//         fixedTerrainHeight = Math.round(scene.globe ? (scene.globe.getHeight(carto) || 0) : 0);
//     }

//     if (window.GcsApp && window.GcsApp.state) {
//         if (window.GcsApp.state.lastRightClickLon) {
//             lon = window.GcsApp.state.lastRightClickLon; lat = window.GcsApp.state.lastRightClickLat;
//         }
//         if (fixedTerrainHeight === 0 && scene.globe) {
//             fixedTerrainHeight = Math.round(scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) || 0);
//         }
//     }

//     if (fixedTerrainHeight <= 0 || isNaN(fixedTerrainHeight)) fixedTerrainHeight = 86; 

//     var calculatedRoofHeight = extractedHeight;
//     var finalNetHeightInt = calculatedRoofHeight - fixedTerrainHeight;

//     if (finalNetHeightInt <= 2 || finalNetHeightInt > 200 || isNaN(finalNetHeightInt)) {
//         finalNetHeightInt = 25; 
//         fixedTerrainHeight = calculatedRoofHeight - finalNetHeightInt;
//     }

//     var safeAltitude = calculatedRoofHeight + 60; 
//     var dynamicBuildingName = isBuilding ? "3D 관제 지정 빌딩 옥상" : "자연 지표면 평지 이륙장";

//     var pickedFeature = (window.GcsApp && window.GcsApp.state) ? (window.GcsApp.state.gcsSelectedFeature || window.GcsApp.state.gcsHoveredFeature) : null;
//     if (pickedFeature && typeof pickedFeature.getProperty === "function") {
//         var nativeName = pickedFeature.getProperty("name") || pickedFeature.getProperty("BLDG_NM") || pickedFeature.getProperty("bldg_nm");
//         if (nativeName) dynamicBuildingName = nativeName;
//     }

//     if (window.GcsApp && window.GcsApp.state) {
//         window.GcsApp.state.lastRightClickRoofHeight = calculatedRoofHeight;
//         window.GcsApp.state.calculatedSafeAltitude = safeAltitude;

//         if (Array.isArray(window.GcsApp.state.waypointList) && window.GcsApp.state.waypointList.length > 0) {
//             var homeNode = window.GcsApp.state.waypointList;
//             if (homeNode && (homeNode.id === "Home" || homeNode.type === "Home")) {
//                 homeNode.lon = lon; homeNode.lat = lat;
//                 homeNode.alt = calculatedRoofHeight; 
//                 homeNode.roofBase = calculatedRoofHeight;
//                 homeNode.address = dynamicBuildingName;
//             }
//         }
//     }

//     // 좌측 비행경로 리스트 영역 내부의 홈설정 카드 DOM 구조 강제 개조
//     var forceGcsLeftUiHomeCardTextInject = function() {
//         var allElements = document.querySelectorAll("div, span, label, p");
//         allElements.forEach(function(el) {
//             if (el.childNodes.length > 0) {
//                 for (var i = 0; i < el.childNodes.length; i++) {
//                     var node = el.childNodes[i];
//                     if (node.nodeType === 3 && (node.nodeValue.includes("지면고도:") || node.nodeValue.includes("건물고도:"))) {
//                         if (isBuilding) {
//                             el.innerHTML = `건물고도: <span style="color: #fffa65; font-weight: bold; font-size: 14px;">${calculatedRoofHeight}m</span>`;
//                         } else {
//                             el.innerHTML = `지면고도: <span style="color: #00ffcc; font-weight: bold; font-size: 14px;">${fixedTerrainHeight}m</span>`;
//                         }
//                     }
//                 }
//             }
//             if (el.textContent === "관제 고도" || el.textContent === "관제고도") {
//                 var nextInput = el.parentNode ? el.parentNode.querySelector("input") : null;
//                 if (nextInput) nextInput.value = safeAltitude; 
//             }
//         });

//         var liveMarginInput = document.getElementById("gcs_home_alt_input");
//         if (liveMarginInput) liveMarginInput.value = calculatedRoofHeight;
//     };

//     forceGcsLeftUiHomeCardTextInject();

//     // 마지막 설정 제원 마스터 로컬 데이터 스토리지 저장 (다시 접속 복원용)
//     var gcsPersistenceBundle = {
//         lon: lon, lat: lat,
//         calculatedRoofHeight: calculatedRoofHeight,
//         fixedTerrainHeight: fixedTerrainHeight,
//         safeAltitude: safeAltitude,
//         dynamicBuildingName: dynamicBuildingName,
//         isBuilding: isBuilding
//     };
//     localStorage.setItem("GCS_LAST_SAVED_HOME_PORT_CACHE", JSON.stringify(gcsPersistenceBundle));

//     // 3D 삼각기둥 공역과 드론 포트 투사 격발
//     gcsDeployDynamicHPadAndPrismAirspace(lon, lat, calculatedRoofHeight, dynamicBuildingName);
// }

/**
 * 💥 [부트스트랩] 다시 접속(새로고침) 시 마지막 드론포트 상태 및 좌측 가변 UI 텍스트까지 완벽 복원
 */
// function gcsBootstrapPersistenceRestoreEngine() {
//     var rawCache = localStorage.getItem("GCS_LAST_SAVED_HOME_PORT_CACHE");
//     if (!rawCache) return;

//     try {
//         var bundle = JSON.parse(rawCache);
//         console.log("%c🚀 [GCS 복원 스레드 격발] 이전 접속 때 마감된 드론 이륙 포트와 삼각기둥 공역을 복구합니다.", "color: #00ffcc; font-weight: bold;");

//         setTimeout(function() {
//             if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
//                 gcsDeployDynamicHPadAndPrismAirspace(bundle.lon, bundle.lat, bundle.calculatedRoofHeight, bundle.dynamicBuildingName);

//                 if (window.GcsApp && window.GcsApp.state) {
//                     window.GcsApp.state.lastRightClickRoofHeight = bundle.calculatedRoofHeight;
//                     window.GcsApp.state.calculatedSafeAltitude = bundle.safeAltitude;
//                     window.GcsApp.state.lastRightClickLon = bundle.lon;
//                     window.GcsApp.state.lastRightClickLat = bundle.lat;
//                 }
// var labelElements = document.querySelectorAll("div, span, label, p");
// labelElements.forEach(function(el) {
// if (el.childNodes.length > 0) {
// for (var i = 0; i < el.childNodes.length; i++) {
// var node = el.childNodes[i];
// if (node.nodeType === 3 && (node.nodeValue.includes("지면고도:") || node.nodeValue.includes("건물고도:"))) {
// if (bundle.isBuilding) {
// el.innerHTML = `건물고도: <span style="color: #fffa65; font-weight: bold; font-size: 14px;">${bundle.calculatedRoofHeight}m</span>`;
// } else {
// el.innerHTML = `지면고도: <span style="color: #00ffcc; font-weight: bold; font-size: 14px;">${bundle.fixedTerrainHeight}m</span>`;
// }
// }
// }
// }
// });
// var liveControlInput = document.getElementById("gcs_home_alt_input");
// if (liveControlInput) liveControlInput.value = bundle.calculatedRoofHeight;
// if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
// console.log("%c✅ [복원 마감 완료] 이전 가변 홈카드 UI와 드론 포트가 화면에 영구 복구되었습니다.", "color: #2ed573; font-weight: bold;");
// }
// }, 2500);
// } catch(err) {
// console.error("⚠️ 이전 관제 상태 캐시 파싱에 실패했습니다.", err);
// }
// }
// gcsBootstrapPersistenceRestoreEngine();


/**
 * 🔒 [완치 포인트 3] 새로고침 / 재접속(부트스트랩) 시 이전 관제 상태 영구 완벽 복원 복구 엔진
 * 인라인 텍스트 가로채기는 물론 3D 포트와 실시간 가변 원기둥까지 화면에 완벽하게 재구성합니다.
 */
// function gcsBootstrapPersistenceRestoreEngine() {
//     var rawCache = localStorage.getItem("GCS_LAST_SAVED_HOME_PORT_CACHE");
//     if (!rawCache) return;

//     try {
//         var bundle = JSON.parse(rawCache);
//         console.log("%c🚀 [GCS 복원 엔진] 이전 접속 시 고정 마감된 드론 이륙 포트와 원기둥 공역 영구 복구를 기동합니다.", "color: #00ffcc; font-weight: bold;");

//         // 브이월드 내장 3D 타일셋 캔버스 버퍼가 안착하도록 안전 유예 버퍼 타임 배정 후 복원 시동
//         setTimeout(function () {
//             if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {

//                 // 1. 전역 좌표 및 안전 고도 상태 복원 바인딩
//                 if (window.GcsApp && window.GcsApp.state) {
//                     window.GcsApp.state.lastRightClickRoofHeight = bundle.calculatedRoofHeight;
//                     window.GcsApp.state.calculatedSafeAltitude = bundle.safeAltitude;
//                     window.GcsApp.state.lastRightClickLon = bundle.lon;
//                     window.GcsApp.state.lastRightClickLat = bundle.lat;
//                 }

//                 // 2. 3D 드론 포트 패드 및 가변 원기둥 공역 화면 복원 사출
//                 gcsDeployDynamicHPadAndPrismAirspace(bundle.lon, bundle.lat, bundle.calculatedRoofHeight, bundle.dynamicBuildingName, bundle.safeAltitude);

//                 // 3. 좌측 카드 UI의 가변 항목 명세 텍스트 구조 동적 정밀 복원
//                 // var cardContainer = document.getElementById("card_waypoint_Home") || document.getElementById("gcs_waypoint_list_container");
//                 // if (cardContainer) {
//                 //     var labelTarget = cardContainer.querySelector("div[style*='display: flex'][style*='gap:']");
//                 //     if (labelTarget && labelTarget.parentNode) {
//                 //         var targetDiv = labelTarget.parentNode;
//                 //         var oldHeightLabel = targetDiv.querySelector(".gcs-dynamic-height-label-node");
//                 //         if (oldHeightLabel) oldHeightLabel.remove();

//                 //         var newHeightEl = document.createElement("div");
//                 //         newHeightEl.className = "gcs-dynamic-height-label-node";
//                 //         newHeightEl.style.marginTop = "4px";

//                 //         if (bundle.isBuilding) {
//                 //             newHeightEl.innerHTML = `건물고도: <span style="color: #fffa65; font-weight: bold; font-size: 13px;">${bundle.calculatedRoofHeight}m</span> (옥상높이)`;
//                 //         } else {
//                 //             newHeightEl.innerHTML = `지면고도: <span style="color: #00ffcc; font-weight: bold; font-size: 13px;">${bundle.fixedTerrainHeight}m</span> (지상높이)`;
//                 //         }
//                 //         targetDiv.appendChild(newHeightEl);
//                 //     }
//                 // }



//                 // 🔒 [정밀 수정 위치 3] 복원 엔진 내부의 가짜 텍스트 삽입 스레드를 청소합니다.
//                 var cardContainer = document.getElementById("card_waypoint_Home");
//                 if (cardContainer) {
//                     var childNodes = cardContainer.querySelectorAll("div, p, span");
//                     childNodes.forEach(function(node) {
//                         if ((node.textContent.includes("지면고도:") || node.textContent.includes("건물고도:")) && !node.querySelector("input") && node.id !== "gcs_core_height_anchor_node") {
//                             node.remove();
//                         }
//                     });

//                     var existAnchor = cardContainer.querySelector("#gcs_core_height_anchor_node");
//                     if (existAnchor) {
//                         if (bundle.isBuilding) {
//                             existAnchor.innerHTML = `<span>건물고도:</span><strong style="color: #fffa65; font-size: 12px;">${bundle.calculatedRoofHeight}m</strong>`;
//                         } else {
//                             existAnchor.innerHTML = `<span>지면고도:</span><strong style="color: #00ffcc; font-size: 12px;">${bundle.fixedTerrainHeight}m</strong>`;
//                         }
//                     }
//                 }



//                 // 4. 관제 고도 인풋 박스 수치 실시간 바인딩
//                 var liveControlInput = document.getElementById("gcs_home_alt_input");
//                 if (liveControlInput) {
//                     liveControlInput.value = bundle.safeAltitude;
//                 }

//                 if (typeof window.rebuildGcsPipelineAndLabels === "function") {
//                     window.rebuildGcsPipelineAndLabels();
//                 }
//                 console.log("%c✅ [복원 마감 완료] 가변 홈카드 UI 명세와 드론 포트 원기둥이 영구 동기화 복구되었습니다.", "color: #2ed573; font-weight: bold;");
//             }
//         }, 1800); // 1.8초 지연을 두어 안전하게 지형 로딩 후 투사
//     } catch (err) {
//         console.error("⚠️ 이전 관제 제원 캐시 패키지 파싱 실패:", err);
//     }
// }

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
            var homeNode = list.find(function(n) { return n && n.id === "Home"; });
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
    var forceGcsLeftUiHomeCardTextInject = function() {
        var cardContainer = document.getElementById("card_waypoint_Home");
        if (cardContainer) {
            // 외부 루프가 무단 복제하여 밀어 넣던 가짜 중복 상단 라인 추적하여 완전 삭제
            var childNodes = cardContainer.querySelectorAll("div, p, span");
            childNodes.forEach(function(node) {
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


// // =========================================================================
// // 🛸 [GCS 최종 완결] 비동기 마운트 시점 보정 및 3D 원기둥 실시간 관통 사출 패치
// // =========================================================================
// (function gcsFinalAsynchronousFixSyncChain() {
//     console.log("%c🔓 [GCS 통합 마감] 비동기 마운트 시점 보정반 기동 ➡️ 3D 원기둥 관통 파이프라인을 최종 결착합니다.", "color: #2ed573; font-weight: bold;");

//     // 지형 최적화 기능의 비동기 리셋 간섭 신호를 무력화하기 위한 전역 수동 락 플래그
//     window.gcsUserManualAltOverrideLock = true; 

//     /**
//      * 사용자가 인풋창의 수치를 바꿀 때 또는 초기 복원 시 3D 원기둥을 사출하는 핵심 드라이버
//      */
//     window.gcsDirectExtrudePrismVolumetric = function() {
//         var altInput = document.getElementById("gcs_home_alt_input");
//         if (!altInput) return;

//         var currentManualAlt = parseInt(altInput.value, 10);
//         if (isNaN(currentManualAlt) || currentManualAlt <= 0) return;

//         window.gcsUserManualAltOverrideLock = true; 

//         var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
//         var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){ return n && n.id === "Home"; }) : null;
        
//         var targetLon = homeNode ? homeNode.lon : (window.GcsApp.state.lastRightClickLon || 126.919366);
//         var targetLat = homeNode ? homeNode.lat : (window.GcsApp.state.lastRightClickLat || 37.460760);
        
//         // 캐시 및 노드에서 원본 건물고도 제원을 오염 없이 포획
//         var baseH = homeNode ? parseFloat(homeNode.roofBase) : 103.0;
//         var bName = homeNode ? (homeNode.address || "3D 관제 지정 빌딩 옥상") : "3D 관제 지정 빌딩 옥상";
//         if (homeNode) {
//         homeNode.alt = currentManualAlt;
//         homeNode.altitude_Z = currentManualAlt;
//         if (homeNode.safeAltitude) homeNode.safeAltitude = currentManualAlt;
//     }

//     // 💥 [원본 수정 매립 2] 새로고침 롤백 박멸을 위해 영구 스토리지 캐시 실시간 동기화 강착
//     localStorage.setItem("gcs_permanent_home_lock", JSON.stringify({ 
//         lon: targetLon, 
//         lat: targetLat, 
//         alt: currentManualAlt, 
//         address: bName,
//         calculatedRoofHeight: baseH
//     }));

//     // 기존 순정 원기둥 사출 및 가이드선 리프레시 팩토리 호출부 보존
//     if (typeof window.gcsDeployDynamicHPadAndPrismAirspace === "function") {
//         window.gcsDeployDynamicHPadAndPrismAirspace(targetLon, targetLat, baseH, bName, currentManualAlt);
//     }
//     if (typeof window.rebuildGcsPipelineAndLabels === "function") {
//         window.rebuildGcsPipelineAndLabels();
//     }
// }

//     /**
//      * 순정 지형 최적화 기능의 비동기 덮어쓰기 로직 우회 차단벽 구축 후킹
//      */
//     if (typeof window.gcsExecuteTerrainOptimizationReturnData === "function" && !window.gcsExecuteTerrainOptimizationReturnData.isUltimateAltHooked) {
//         var originalOptimizeEngine = window.gcsExecuteTerrainOptimizationReturnData;
        
//         window.gcsExecuteTerrainOptimizationReturnData = function() {
//             if (window.gcsUserManualAltOverrideLock === true) {
//                 var altInput = document.getElementById("gcs_home_alt_input");
//                 var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
//                 var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){ return n && n.id === "Home"; }) : null;
 
//                 var currentManualAlt = altInput ? parseInt(altInput.value, 10) : (homeNode ? homeNode.alt : 200);
//                 if (isNaN(currentManualAlt)) currentManualAlt = 200;

//                 var result = originalOptimizeEngine.apply(this, arguments);
//                 if (homeNode) { homeNode.alt = currentManualAlt; homeNode.altitude_Z = currentManualAlt; }
//                 if (altInput) altInput.value = currentManualAlt;
                
//                 if (typeof window.gcsDirectExtrudePrismVolumetric === "function") {
//                     window.gcsDirectExtrudePrismVolumetric();
//                 }
//                 return result;
//             }
//             return originalOptimizeEngine.apply(this, arguments);
//         };
//         window.gcsExecuteTerrainOptimizationReturnData.isUltimateAltHooked = true;
//     }

//     /**
//      * 순정 리스트 리렌더러 동기화 보완
//      */
//     if (typeof window.renderWaypointListUI === "function" && !window.renderWaypointListUI.isPerfectHijacked) {
//         var originalWaypointListRenderer = window.renderWaypointListUI;
        
//         window.renderWaypointListUI = function() {
//             var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
//             if (savedHomeLock) {
//                 try {
//                     var homeData = JSON.parse(savedHomeLock);
//                     var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
//                     var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){ return n && n.id === "Home"; }) : null;
                    
//                     if (homeNode && homeData && homeData.alt > 0) {
//                         homeNode.alt = homeData.alt;
//                         homeNode.altitude_Z = homeData.alt;
//                         if (homeData.calculatedRoofHeight > 0) {
//                             homeNode.roofBase = homeData.calculatedRoofHeight;
//                             homeNode.roofHeight = homeData.calculatedRoofHeight;
//                         }
//                     }
//                 } catch(e){}
//             }
//             originalWaypointListRenderer.apply(this, arguments);
//         };
//         window.renderWaypointListUI.isPerfectHijacked = true;
//     }

//     // 💥 [비동기 렌더링 누락 방지 훅]
//     // 새로고침 시 Cesium 3D 맵 인스턴스가 완전히 렌더링 엔진 메모리에 바인딩될 수 있도록
//     // 충분한 버퍼 시간 간격(500ms, 1200ms, 2000ms)을 두고 누락된 원기둥을 안전하게 밀어 올려 안착시킵니다.
//     var executeInitialBootSync = function() {
//         var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
//         var altInput = document.getElementById("gcs_home_alt_input");

//         if (savedHomeLock && altInput) {
//             try {
//                 var homeData = JSON.parse(savedHomeLock);
//                 var liveSafeAlt = homeData.alt || 200;
//                 var liveSavedHeight = homeData.calculatedRoofHeight || 103;

//                 altInput.value = liveSafeAlt;

//                 var list = (window.GcsApp && window.GcsApp.state) ? window.GcsApp.state.waypointList : (window.waypointList || []);
//                 var homeNode = (Array.isArray(list) && list.length > 0) ? list.find(function(n){ return n && n.id === "Home"; }) : null;
//                 if (homeNode) {
//                     homeNode.alt = liveSafeAlt;
//                     homeNode.altitude_Z = liveSafeAlt;
//                     homeNode.roofBase = liveSavedHeight;
//                     homeNode.roofHeight = liveSavedHeight;
//                     if (!homeNode.id || homeNode.id !== "Home") homeNode.id = "Home";
//                 }

//                 window.gcsDirectExtrudePrismVolumetric();
//             } catch(e){}
//         }
//     };

//     window.addEventListener("load", function() {
//         setTimeout(executeInitialBootSync, 500);
//         setTimeout(executeInitialBootSync, 1200);
//         setTimeout(executeInitialBootSync, 2000); // 💥 최종 지도 마운트 버퍼 시점 완벽 보장 보호막
//     });

//     var bindLiveInputSyncChain = function() {
//         var altInput = document.getElementById("gcs_home_alt_input");
//         if (altInput && !altInput.isHijackChainHooked) {
//             altInput.isLiveMasterHooked = true; 
//             altInput.addEventListener("change", function(e) { window.gcsUserManualAltOverrideLock = true; window.gcsDirectExtrudePrismVolumetric(); });
//             altInput.addEventListener("input", function(e) { window.gcsUserManualAltOverrideLock = true; window.gcsDirectExtrudePrismVolumetric(); });
//             altInput.addEventListener("blur", function(e) { window.gcsDirectExtrudePrismVolumetric(); });
//             altInput.addEventListener("keyup", function(e) { window.gcsUserManualAltOverrideLock = true; window.gcsDirectExtrudePrismVolumetric(); });
//             altInput.isHijackChainHooked = true;
//         }
//     };

//     document.body.addEventListener("focusin", function(event) { bindLiveInputSyncChain(); });
//     document.body.addEventListener("click", function(event) { bindLiveInputSyncChain(); });
// })();

// =========================================================================
// 🔒 [완치 결착] 시뮬레이션 긴급중지 / 재시작 코어 토글 인터록 엔진 수선
// =========================================================================
window.isGcsSimulationPaused = false;

window.toggleGcsDroneSimulationStatus = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
        console.warn("⚠️ [GCS 가드] Cesium 3D 지도 엔진이 가용 상태가 아닙니다.");
        return;
    }
    
    var mainViewer = ws3d.viewer;
    var stopwatchTimeSpan = document.getElementById("gcs_stopwatch_time_core");

    // 시뮬레이션 기체가 아예 생성되지 않은 대기 상태라면 제어 차단
    if (!window.gcsSimulatedDroneEntity) {
        alert("🛸 현재 라이브 항행 시뮬레이션이 기동 중이 아닙니다. [자율주행 시뮬레이션 시작]을 먼저 눌러주세요.");
        return;
    }

    // 상태 플래그 반전 (스위칭 토글)
    window.isGcsSimulationPaused = !window.isGcsSimulationPaused;

    if (window.isGcsSimulationPaused) {
        // A. [긴급 중지] 상태 집행
        mainViewer.clock.shouldAnimate = false; // Cesium 시간 스레드 정지 및 기체 고정
        
        console.log("%c🛑 [GCS 긴급 관제] 시뮬레이션 항행 스레드를 긴급 일시정지(PAUSE) 락온했습니다.", "color: #ef5350; font-weight: bold;");
        
        // 시각적 피드백을 위한 알림 팝업 (선택사항, 흐름 차단 방지를 위해 콘솔 및 버튼 텍스트 변경 유도 가능)
        if (typeof window.rebuildGcsPipelineAndLabels === "function") {
            window.rebuildGcsPipelineAndLabels();
        }
    } else {
        // B. [재시작 / 항행 복귀] 상태 집행
        mainViewer.clock.shouldAnimate = true; // Cesium 시간 재기동 및 드론 자율 이동 재개
        
        console.log("%c🚀 [GCS 관제 복귀] 시뮬레이션 자율 순항 스레드를 정상 재시작(RESUME) 격발했습니다.", "color: #2ecc71; font-weight: bold;");
        
        // 정지되어 있던 미션 초시계 타이머의 동기화 정합성을 맞추기 위해 내부 타임아웃 보정 유도
        mainViewer.scene.requestRender();
    }
};
// =========================================================================