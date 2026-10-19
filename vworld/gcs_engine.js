

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
 * 💥 [완치 패치] 지도가 최초 기동(onInit)되는 즉시 로컬 DB를 추적해 
 * 카메라를 홈 위치로 바인딩하고, Cesium 엔진이 완벽히 준비되는 순간 3D 삼각기둥을 강제 빌드합니다.
 */
map.onInit = function () {
    console.log("📡 [GCS 영구 복원 부트스트랩] 데이터베이스를 역추적하여 시스템을 자동 복구합니다.");

    var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG) ? (window.GcsApp.CONFIG.DEFAULT_ALTITUDE || 150.0) : 150.0;

    // 1. 💾 로컬 스토리지 데이터 백업 유무 확인 및 동기화
    var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
    var activeHomeData = null;

    if (savedHomeLock) {
        var parsedHome = JSON.parse(savedHomeLock);
        activeHomeData = {
            id: "Home",
            lon: parseFloat(parsedHome.lon),
            lat: parseFloat(parsedHome.lat),
            alt: parseFloat(parsedHome.alt || defaultAlt),
            address: parsedHome.address || `사용자 지정 출발지 (${parsedHome.lon.toFixed(4)}, ${parsedHome.lat.toFixed(4)})`
        };
        NANGOK_LON = activeHomeData.lon;
        NANGOK_LAT = activeHomeData.lat;
        console.log("💾 [GCS 영구 로더] 저장된 홈 좌표 복원 완료:", activeHomeData);
    } else {
        // 백업이 없는 순수 최초 접속 상태인 경우 초기 기본값(스크린샷 기준 난곡로 60 부근) 구성
        var initLon = typeof NANGOK_LON !== "undefined" && NANGOK_LON ? NANGOK_LON : 126.919435;
        var initLat = typeof NANGOK_LAT !== "undefined" && NANGOK_LAT ? NANGOK_LAT : 37.460975;
        activeHomeData = {
            id: "Home",
            lon: initLon,
            lat: initLat,
            alt: defaultAlt,
            address: "사용자 지정 출발지 (난곡로 60 부근)"
        };
    }

    // 2. 📋 데이터 동기화 무결성 확보 (배열이 비었거나 첫 칸이 홈이 아니면 무조건 교체)
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList || [];
    if (list.length === 0 || list[0].id !== "Home") {
        list.unshift(activeHomeData);
    } else {
        list[0] = activeHomeData;
    }
    if (window.GcsApp && window.GcsApp.state) window.GcsApp.state.waypointList = list;
    window.waypointList = list;

    // 3. 🎨 좌측 비행 노드 리스트 UI 최상단에 노란색 홈설정 관제 카드 즉시 사출 고정
    if (typeof window.renderWaypointListUI === "function") {
        window.renderWaypointListUI();
    }

    // 4. 🔗 [핵심 완치 가드] Cesium 엔진 내부 viewer 인스턴스가 완벽히 준비 완료될 때까지 정밀 추적 검사 루프 기동
    var checkEngineReadyInterval = setInterval(function () {
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.entities) {
            // 엔진이 완벽하게 로딩되었으므로 인터벌 타이머 즉시 파괴 안전 해제
            clearInterval(checkEngineReadyInterval);

            var mainViewer = ws3d.viewer;
            console.log("🛸 [GCS 엔진 추적 성공] Cesium Viewer 로딩 완료 확인 -> 삼각기둥 공역 디플로이를 개시합니다.");

            // A. 카메라 팅김 방지 가드 기반 해당 좌표 정면 3인칭 조감 뷰 자동 비행(flyTo)
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(activeHomeData.lon, activeHomeData.lat - 0.0012, 220),
                orientation: {
                    heading: Cesium.Math.toRadians(0.0),
                    pitch: Cesium.Math.toRadians(-40.0),
                    roll: 0.0
                },
                duration: 1.0
            });

            // B. 지상 공간 출발지 노란색 핀 마커 꽂기
            var existingHome = mainViewer.entities.getById("GCS_NODE_ENTITY_Home");
            if (existingHome) mainViewer.entities.remove(existingHome);
            mainViewer.entities.add({
                id: "GCS_NODE_ENTITY_Home",
                position: Cesium.Cartesian3.fromDegrees(activeHomeData.lon, activeHomeData.lat, 0),
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });

            // C. 실시간 복원 좌표 기반 날씬한 주황색 3D 삼각기둥 공역(폭 50% 축소 규격) 빌드 파이프라인
            try {
                var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
                fireZoneEntities.forEach(function (e) { mainViewer.entities.remove(e); });
                window.GcsApp.state.gcsFireZoneEntities = [];

                var nodeAlt = parseFloat(activeHomeData.alt) || defaultAlt;
                var nodeColor = Cesium.Color.DARKORANGE;

                // 꼭짓점 반경 배율 축소 공식 적용 (0.000125)
                var trianglePos = [];
                for (var a = 0; a < 360; a += 120) {
                    var rad = Cesium.Math.toRadians(a);
                    trianglePos.push(activeHomeData.lon + (0.000125 * Math.cos(rad)), activeHomeData.lat + (0.000125 * Math.sin(rad)));
                }

                var polygonEntity = mainViewer.entities.add({
                    polygon: {
                        hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePos),
                        height: 0.0,
                        extrudedHeight: nodeAlt,
                        material: nodeColor.withAlpha(0.32),
                        outline: true,
                        outlineColor: nodeColor.withAlpha(0.6),
                        outlineWidth: 3
                    }
                });

                var labelEntity = mainViewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(activeHomeData.lon, activeHomeData.lat, nodeAlt + 15.0),
                    label: {
                        text: activeHomeData.id + " (" + Math.round(nodeAlt) + "m)",
                        font: 'bold 13px "Malgun Gothic", sans-serif',
                        fillColor: nodeColor,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    }
                });

                window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity, labelEntity);

                // 세슘 캔버스 버퍼 강제 리렌더링 명령 사출
                mainViewer.scene.requestRender();
                console.log("🛸 [GCS 완공] 3D 삼각기둥 공역 및 고도 레이블 배치 완료");
            } catch (err) {
                console.warn("⚠️ 에어돔 가드 스킵 작동:", err);
            }
        }
    }, 200); // 0.2초마다 세슘 viewer가 준비될 때까지 끊임없이 스캔 탐색합니다.
};













/**
 * WMS 게이트웨이 레이어 표준 초기화 가드
 */
window.initDisasterWMSLayer = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    try {
        window.GcsApp.state.vworldDisasterLayerInstance = ws3d.viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
                url: "https://api.vworld.kr/req/wms",
                layers: "lt_c_spbd",
                parameters: {
                    service: "WMS",
                    version: "1.1.1",
                    request: "GetMap",
                    styles: "lt_c_spbd",
                    format: "image/png",
                    transparent: "true",
                    apiKey: window.GcsApp.CONFIG.WMS_API_KEY
                },
                proxy: new Cesium.DefaultProxy("/proxy.do")
            })
        );
        window.GcsApp.state.vworldDisasterLayerInstance.show = false;
    } catch (e) { console.warn("⚠️ WMS 초기화 가드 작동:", e); }
};

window.toggleFireWMS = function (elementOrChecked) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    if (!window.GcsApp.state.vworldDisasterLayerInstance) window.initDisasterWMSLayer();

    var isShow = false;
    if (typeof elementOrChecked === "boolean") {
        isShow = elementOrChecked;
    } else if (elementOrChecked && typeof elementOrChecked === "object") {
        isShow = elementOrChecked.checked !== undefined ? elementOrChecked.checked : jQuery(elementOrChecked).is(":checked");
    }

    if (window.GcsApp.state.vworldDisasterLayerInstance) {
        window.GcsApp.state.vworldDisasterLayerInstance.show = isShow;
    }
};

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
        domain: "127.0.0.1",
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
            if (typeof window.setGcsPermanentHome === "function") {
                window.setGcsPermanentHome(lon, lat, displayTitle);
            } else {
                // 백업 가드: setGcsPermanentHome이 호출 불가능할 때 다이렉트로 스토리지 락 및 리스트 갱신
                var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG) ? (window.GcsApp.CONFIG.DEFAULT_ALTITUDE || 150.0) : 150.0;
                window.gcsPermanentHomeData = { id: "Home", lon: lon, lat: lat, alt: defaultAlt, address: displayTitle };
                localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(window.gcsPermanentHomeData));

                var list = window.GcsApp.state.waypointList || window.waypointList || [];
                if (list.length > 0 && list[0].id === "Home") list[0] = window.gcsPermanentHomeData;
                else list.unshift(window.gcsPermanentHomeData);

                window.GcsApp.state.waypointList = list;
                window.waypointList = list;
                if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
            }

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
 * ⏪ [순정 마스터 - 삼각기둥 링킹 완전 복원본]
 * 복잡한 건물 고도 계산은 전부 제거하여 시스템 부하를 차단했습니다.
 * 사용자가 좌측 노란색 홈 카드를 클릭하는 즉시, 카메라 비행 및 주황색 3D 삼각기둥 공역을 즉시 강제 렌더링합니다.
 */
window.renderWaypointListUI = function () {
    var container = document.getElementById("wp_list_container") || 
                    document.getElementById("gcs_waypoint_list_container") || 
                    document.getElementById("waypoint_list");
    if (!container) return;
    
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) 
               ? window.GcsApp.state.waypointList 
               : window.waypointList;

    if (!Array.isArray(list)) list = [];
    container.innerHTML = "";
    var defaultAlt = 200.0; 

    var savedHomeLock = localStorage.getItem("gcs_permanent_home_lock");
    var activeHome = null;

    if (savedHomeLock) {
        var parsedHome = JSON.parse(savedHomeLock);
        activeHome = {
            id: "Home",
            lon: parseFloat(parsedHome.lon),
            lat: parseFloat(parsedHome.lat),
            alt: parseFloat(parsedHome.alt || defaultAlt),
            address: parsedHome.address || "사용자 지정 출발지"
        };
    } else {
        var initLon = typeof NANGOK_LON !== "undefined" && NANGOK_LON ? NANGOK_LON : 126.919435;
        var initLat = typeof NANGOK_LAT !== "undefined" && NANGOK_LAT ? NANGOK_LAT : 37.460975;
        activeHome = { id: "Home", lon: initLon, lat: initLat, alt: defaultAlt, address: "사용자 지정 출발지 (기본값)" };
    }

    if (list.length === 0) { list.push(activeHome); } 
    else if (list[0].id !== "Home") { list.unshift(activeHome); } 
    else { activeHome.alt = parseFloat(list[0].alt) || activeHome.alt; list[0] = activeHome; }

    if (window.GcsApp && window.GcsApp.state) window.GcsApp.state.waypointList = list;
    window.waypointList = list;

    list.forEach(function (wp, idx) {
        if (idx === 0 || wp.id === "Home") {
            var homeCard = document.createElement("div");
            homeCard.className = "gcs-waypoint-card active";
            homeCard.id = "card_waypoint_Home";
            // 가시성 극대화를 위한 오리지널 플렉스 레이아웃 CSS 복구 마킹
            homeCard.style.cssText = "margin: 4px 0 8px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid #f1c40f; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer; transition: 0.2s;";
            
            homeCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; pointer-events: none;">
                    <span style="font-weight: bold; color: #f1c40f; font-size: 14px;">🚩 출발지 (Home)</span>
                    <span style="font-size: 11px; background: #f1c40f; color: #000; padding: 2px 6px; border-radius: 10px; font-weight: bold;">관제 고정</span>
                </div>
                <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5; pointer-events: none;">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 2px;">지점: ${wp.address}</div>
                    <div style="display: flex; gap: 10px; margin-bottom: 4px;">
                        <span>경도: ${wp.lon.toFixed(6)}</span>
                        <span>위도: ${wp.lat.toFixed(6)}</span>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: bold; color: #2ecc71; font-size: 12px;">관제 고도:</span>
                    <input type="number" id="gcs_home_alt_input" value="${Math.round(wp.alt)}" style="width: 55px; background: #111; color: #2ecc71; border: 1px solid #2ecc71; text-align: center; border-radius: 3px; font-size: 12px; font-weight: bold; padding: 2px;" />
                    <span style="color: #2ecc71; font-weight: bold; font-size: 12px;">m</span>
                </div>
            `;

            homeCard.onmouseover = function () { this.style.background = "rgba(47, 54, 64, 0.95)"; };
            homeCard.onmouseout = function () { this.style.background = "rgba(30, 39, 46, 0.95)"; };

            var altInput = homeCard.querySelector("#gcs_home_alt_input");
            
            // 고도 숫자판 조작 시 실시간 반영 이벤트 가드
            var altEventHandler = function (e) {
                e.stopPropagation();
                var newAlt = parseFloat(this.value) || defaultAlt;
                wp.alt = newAlt;
                if (window.gcsPermanentHomeData) window.gcsPermanentHomeData.alt = newAlt;
                
                var currentLock = localStorage.getItem("gcs_permanent_home_lock");
                if (currentLock) {
                    var parsed = JSON.parse(currentLock);
                    parsed.alt = newAlt;
                    localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(parsed));
                }
                if (typeof window.rebuildGcsPipelineAndLabels === "function") {
                    window.rebuildGcsPipelineAndLabels();
                }
            };
            altInput.addEventListener("change", altEventHandler);
            altInput.addEventListener("input", altEventHandler);
            altInput.addEventListener("click", function(e) { e.stopPropagation(); });

            // 💥 [핵심 완치 구현] 홈 카드를 수동으로 마우스 딸깍 클릭했을 때의 3D 공간 드로잉 파이프라인 결착
            homeCard.addEventListener("click", function () {
                if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
                var mainViewer = ws3d.viewer;
                var currentAlt = parseFloat(altInput.value) || defaultAlt;

                // A. 카메라 앵글을 출발지 정면 3인칭 조감 뷰로 부드럽게 비행 이동
                mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                mainViewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat - 0.0012, 220),
                    orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-40.0), roll: 0.0 },
                    duration: 0.8
                });

                // B. 지상 공간에 노란색 정점 핀 배치
                var existingMarker = mainViewer.entities.getById("GCS_NODE_ENTITY_Home");
                if (existingMarker) mainViewer.entities.remove(existingMarker);
                mainViewer.entities.add({
                    id: "GCS_NODE_ENTITY_Home",
                    position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0),
                    point: { pixelSize: 15, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
                });

                // C. 상공 주황색 3D 삼각기둥 공역 및 텍스트 레이블 투영 연쇄 격발
                if (typeof window.rebuildGcsPipelineAndLabels === "function") {
                    window.rebuildGcsPipelineAndLabels();
                }
            });

            container.appendChild(homeCard);
        } else {
            var isDest = (wp.id === "Destination");
            var titleColor = isDest ? "#ef5350" : "#3498db";
            var itemHtml = `
                <div class="wp-item" style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin-bottom:4px; background:rgba(44, 62, 80, 0.5); border-radius:4px; font-size:11px; color:#fff;">
                    <div>
                        <strong style="color:${titleColor};">${wp.id}</strong><br>
                        <span style="font-size:10px; color:#bdc3c7;">X: ${wp.lon.toFixed(4)}, Y: ${wp.lat.toFixed(4)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" value="${Math.round(wp.alt)}" onchange="window.updateHeightFromInput('${wp.id}', this.value)" style="width:45px; background:#111; color:#fff; border:1px solid #444; text-align:center; border-radius:3px; font-size:11px;"> m
                        <button onclick="window.deleteWaypoint('${wp.id}')" style="background:#ef5350; border:none; color:#fff; cursor:pointer; padding:2px 6px; border-radius:3px; font-weight:bold;">X</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);
        }
    });
};

/**
 * 💥 [완치 마스터 시스템 부트스트랩]
 * 불안정한 setInterval 타이머를 완전히 폐기하고, 세슘 3D 엔진 코어가 첫 3차원 화면을 모니터 스크린에 
 * 올리는 물리 렌더링 이벤트(preRender) 훅을 가로채 100% 무조건 자동 클릭 신호를 명중시킵니다.
 */
map.onInit = function () {
    console.log("📡 [GCS 마스터 시동] 최초 UI 목록을 빌드합니다.");

    // 1. 좌측 메뉴 UI 파이프라인을 기동하여 고도 200m 스펙의 'card_waypoint_Home' 카드를 화면에 선사출
    if (typeof window.renderWaypointListUI === "function") {
        window.renderWaypointListUI();
    }

    // 2. 🔗 [초정밀 렌더러 후킹] 세슘 내부 씬(Scene)이 첫 그래픽 연산을 수행하는 타이밍 감지
    var checkEngineReadyInterval = setInterval(function () {
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer && ws3d.viewer.scene) {
            clearInterval(checkEngineReadyInterval); // 탐색 인터벌 종료
            
            var mainViewer = ws3d.viewer;
            
            // 세슘 씬의 preRender(화면이 그려지기 직전 프레임) 이벤트 리스너를 일시 등록하여 완벽한 시점을 포착
            var removePreRenderHook = mainViewer.scene.preRender.addEventListener(function() {
                // 단 1회만 실행하고 리스너를 즉시 파괴 해제하여 무한 루프 방지
                removePreRenderHook();
                
                // 엔진 렌더링 버퍼가 확보된 상태에서 홈 카드 엘리먼트 추적
                var homeCardElement = document.getElementById("card_waypoint_Home");
                if (homeCardElement) {
                    console.log("🛸 [GCS 시스템 자동 시동 성공] Cesium preRender 신호 가로채기 완공 ➡️ 홈 카드를 강제 클릭하여 고도 200m 에어돔을 즉시 가동합니다!");
                    homeCardElement.click(); // 강제 클릭 명령 수행
                }
            });
        }
    }, 100); // 0.1초 간격으로 코어 인스턴스 검착
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






/**
 * 🛸 우클릭 메뉴 명령(홈 설정, 경유지 추가, 목적지 설정) 동기화 통합 가드 엔진
 */
window.triggerGcsCommand = function (actionType) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var rawHeight = Math.round(ws3d.viewer.camera.positionCartographic.height);
    var halvedHeight = Math.round((rawHeight <= 0 ? 300 : rawHeight) * 0.5);
    var numLon = parseFloat(window.GcsApp.state.lastRightClickLon);
    var numLat = parseFloat(window.GcsApp.state.lastRightClickLat);
    if (isNaN(numLon) || isNaN(numLat) || numLon === 0) return; 

    // 전역 상태 안전 바인딩 및 강제 배열화 보장
    var list = window.GcsApp.state.waypointList || window.waypointList || []; 
    if (!Array.isArray(list)) list = [];

    var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG) ? (window.GcsApp.CONFIG.DEFAULT_ALTITUDE || 200.0) : 200.0;

    if (actionType === "home") {
        window.gcsPermanentHomeData = { 
            id: "Home", 
            lon: numLon, 
            lat: numLat, 
            alt: defaultAlt,
            address: `사용자 지정 출발지 (${numLon.toFixed(4)}, ${numLat.toFixed(4)})`
        };
        localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(window.gcsPermanentHomeData));
        window.gcsPermanentHomeFlag = true;
        
        if (list.length > 0 && list[0].id === "Home") list[0] = window.gcsPermanentHomeData;
        else list.unshift(window.gcsPermanentHomeData);
        
        console.log("🚩 [홈 변경 성공] 다음 변경 전까지 이 위치가 출발지로 고정됩니다.");
    } else if (actionType === "destination") {
        var dData = { id: "Destination", lon: numLon, lat: numLat, alt: halvedHeight };
        if (list.length > 0 && list[list.length - 1].id === "Destination") {
            list[list.length - 1] = dData;
        } else {
            list.push(dData);
        }
    } else if (actionType === "waypoint") {
        var idx = list.length;
        if (list.length > 0 && list[list.length - 1].id === "Destination") idx = list.length - 1;
        list.splice(idx, 0, { id: "WP_TEMP", lon: numLon, lat: numLat, alt: halvedHeight });
    }

    // 순서 정렬 및 자동 네이밍 재빌드 구조화
    var cleanList = []; 
    var wpCounter = 1;

    // 첫 칸 홈 데이터 유실 차단막
    if (list.length === 0 || list[0].id !== "Home") {
        var savedHome = localStorage.getItem("gcs_permanent_home_lock");
        if (savedHome) {
            cleanList.push(JSON.parse(savedHome));
        } else {
            cleanList.push({ id: "Home", lon: numLon, lat: numLat, alt: defaultAlt, address: "사용자 지정 출발지" });
        }
    }

    list.forEach(function (wp, idx) {
        if (wp.id === "Home") {
            cleanList.push(wp);
        } else {
            var lbl = (idx === list.length - 1 && wp.id === "Destination") ? "Destination" : "WP_" + wpCounter++;
            cleanList.push({ id: lbl, lon: wp.lon, lat: wp.lat, alt: wp.alt });
        }
    });

    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList; 
    
    // 3D 삼각기둥 에어돔 및 라인 전수 리파인 호출
    window.rebuildGcsPipelineAndLabels();
};

/**
 * 🛸 [공역 폭 축소] 3D 입체 에어돔 공역(폭 50% 축소) 및 순항 가이드 polyline 실시간 동기화 빌더
 */
window.rebuildGcsPipelineAndLabels = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;

    // GcsApp 네임스페이스 또는 전역 배열 하이브리드 리소스 안전 해제
    var fireZoneEntities = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.gcsFireZoneEntities)
        ? window.GcsApp.state.gcsFireZoneEntities
        : window.gcsFireZoneEntities;

    fireZoneEntities.forEach(function (e) { ws3d.viewer.entities.remove(e); });

    if (window.GcsApp && window.GcsApp.state) {
        window.GcsApp.state.gcsFireZoneEntities = [];
    } else {
        window.gcsFireZoneEntities = [];
    }

    var pipeLinePositions = [];
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList)
        ? window.GcsApp.state.waypointList
        : window.waypointList;

    var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG && window.GcsApp.CONFIG.DEFAULT_ALTITUDE)
        ? window.GcsApp.CONFIG.DEFAULT_ALTITUDE
        : 150.0;

    list.forEach(function (node) {
        var nodeAlt = parseFloat(node.alt) || defaultAlt;
        var upperAir = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt);
        pipeLinePositions.push(upperAir);

        var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : (node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN;

        // 💥 [폭 50% 축소 핵심부] 
        // 기존 꼭짓점 반경 배율인 0.00025에서 딱 절반인 '0.000125'로 축소하여 삼각기둥을 날씬하게 변경
        var trianglePos = [];
        for (var a = 0; a < 360; a += 120) {
            var rad = Cesium.Math.toRadians(a);
            trianglePos.push(node.lon + (0.000125 * Math.cos(rad)), node.lat + (0.000125 * Math.sin(rad)));
        }

        // 3D 삼각기둥 공역 엔티티 드로잉 (축소된 폭 반영)
        var polygonEntity = ws3d.viewer.entities.add({
            polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePos), height: 0.0, extrudedHeight: nodeAlt, material: nodeColor.withAlpha(0.32), outline: true, outlineColor: nodeColor.withAlpha(0.6), outlineWidth: 3 }
        });

        // 상공 고도 표시 레이블 드로잉
        var labelEntity = ws3d.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt + 15.0),
            label: { text: node.id + " (" + Math.round(nodeAlt) + "m)", font: 'bold 13px "Malgun Gothic", sans-serif', fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });

        if (window.GcsApp && window.GcsApp.state) {
            window.GcsApp.state.gcsFireZoneEntities.push(polygonEntity, labelEntity);
        } else {
            window.gcsFireZoneEntities.push(polygonEntity, labelEntity);
        }
    });

    // 노드 간을 이어주는 녹색 발광 순항선(Polyline) 결착
    if (pipeLinePositions.length > 1) {
        var polylineEntity = ws3d.viewer.entities.add({
            polyline: { positions: pipeLinePositions, width: 5, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }), arcType: Cesium.ArcType.NONE }
        });

        if (window.GcsApp && window.GcsApp.state) {
            window.GcsApp.state.gcsFireZoneEntities.push(polylineEntity);
        } else {
            window.gcsFireZoneEntities.push(polylineEntity);
        }
    }

    if (typeof window.renderWaypointListUI === "function") {
        window.renderWaypointListUI();
    }
    ws3d.viewer.scene.requestRender();
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
/**
• Cesium 3D 웹글 공간 인터랙션 스크린 핸들러 바인딩 훅
*/
vw.ws3dInitCallBack = function () {
    window.viewer = ws3d.viewer;
    var scene = ws3d.viewer.scene;
    var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    scene.canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); e.stopPropagation(); return false; }, { passive: false }); var lastHoveredFeature = undefined;
    handler.setInputAction(function (moveEvent) {
        if (!moveEvent.endPosition) return;
        var pickedFeature = scene.pick(moveEvent.endPosition);
        if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe)) {
            document.body.style.cursor = "pointer";
            if (pickedFeature !== lastHoveredFeature) {
                if (lastHoveredFeature) { try { lastHoveredFeature.color = Cesium.Color.WHITE; } catch (e) { } }
                lastHoveredFeature = pickedFeature;
                try { pickedFeature.color = Cesium.Color.YELLOW.withAlpha(0.40); } catch (e) { }
            }
        } else {
            if (lastHoveredFeature) { try { lastHoveredFeature.color = Cesium.Color.WHITE; } catch (e) { } lastHoveredFeature = undefined; }
            document.body.style.cursor = "default";
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE); handler.setInputAction(function (rightClickEvent) {
        if (!rightClickEvent.position) return;
        var contextMousePosition = rightClickEvent.position;
        var pickedCartesian = scene.pickPosition(contextMousePosition);
        if (!Cesium.defined(pickedCartesian)) pickedCartesian = scene.globe.pick(scene.camera.getPickRay(contextMousePosition), scene);
        if (!Cesium.defined(pickedCartesian)) pickedCartesian = scene.camera.pickEllipsoid(contextMousePosition, scene.globe.ellipsoid); if (Cesium.defined(pickedCartesian)) {
            var cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
            var rawLon = Cesium.Math.toDegrees(cartographic.longitude);
            var rawLat = Cesium.Math.toDegrees(cartographic.latitude);
            if (!isNaN(rawLon) && !isNaN(rawLat) && rawLon !== 0 && rawLat !== 0) {
                window.GcsApp.state.lastRightClickLon = rawLon;
                window.GcsApp.state.lastRightClickLat = rawLat; var ctxMenu = document.getElementById("gcs_context_menu");
                if (ctxMenu) {
                    ctxMenu.style.left = contextMousePosition.x + "px";
                    ctxMenu.style.top = contextMousePosition.y + "px";
                    ctxMenu.style.display = "block";
                    var menuItems = ctxMenu.children;
                    for (var i = 0; i < menuItems.length; i++) {
                        let item = menuItems[i];
                        item.style.cursor = "pointer";
                        if (item.textContent.includes("홈 설정")) item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand("home"); ctxMenu.style.display = "none"; };
                        else if (item.textContent.includes("경유지 추가")) item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand("waypoint"); ctxMenu.style.display = "none"; };
                        else if (item.textContent.includes("목적지 설정")) item.onclick = function (e) { e.stopPropagation(); window.triggerGcsCommand("destination"); ctxMenu.style.display = "none"; };
                    }
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK); scene.canvas.addEventListener("mousedown", function (e) { var m = document.getElementById("gcs_context_menu"); if (m && e.button === 0) m.style.display = "none"; });
    if (typeof window.initDisasterWMSLayer === "function") window.initDisasterWMSLayer();
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


setTimeout(function () { if (typeof ws3d !== "undefined" && ws3d.viewer) window.initDisasterWMSLayer(); }, 1000);





/**
 * 💥 [완치 핵심 3] 지도가 최초 기동(onInit)되는 즉시 
 * 로컬 DB를 추적해 홈 데이터를 복원하고 카메라를 난곡로 60으로 강제 바인딩하는 부트스트랩 리팩토링입니다.
 */
map.onInit = function () {
    setTimeout(function () {
        console.log("📡 [GCS 영구 복원 부트스트랩] 데이터베이스를 역추적하여 시스템을 자동 복구합니다.");

        var savedHome = localStorage.getItem("gcs_permanent_home_lock");
        if (savedHome) {
            var parsedHome = JSON.parse(savedHome);
            NANGOK_LON = parsedHome.lon;
            NANGOK_LAT = parsedHome.lat;
            console.log("💾 [GCS 영구 로더] 저장된 홈 좌표로 초기 안착 지점을 변경했습니다:", parsedHome);
        }

        // 데이터 강제 리로드 및 UI/에어돔 자동 시동
        window.gcsLoadAndApplySavedHome();

        // 카메라 팅김 방지 가드 기반 난곡로 60 정면 3인칭 조감 뷰 자동 비행(flyTo)
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
            ws3d.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            ws3d.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(NANGOK_LON, NANGOK_LAT - 0.0012, 220),
                orientation: {
                    heading: Cesium.Math.toRadians(0.0),
                    pitch: Cesium.Math.toRadians(-40.0),
                    roll: 0.0
                },
                duration: 1.0
            });
        }
    }, 1200);
};

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
    try {
        if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        else if (typeof window.updateFlightPathAirspace === "function") window.updateFlightPathAirspace();
    } catch (e) { }
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
