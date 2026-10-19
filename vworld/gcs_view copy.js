

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

var map;
var options = {
    mapId: "vmap",
    initPosition: new vw.CameraPosition(new vw.CoordZ(126.9780, 37.5665, window.GcsApp.CONFIG.CAMERA_INIT_HEIGHT), new vw.Direction(0, -60, 0)),
    logo: true,
    navigation: true
};

// 브이월드 3D 맵 인스턴스 초기화 동기 기동
map = new vw.Map();
map.setOption(options);
map.setMapId("vmap");
map.setInitPosition(new vw.CameraPosition(new vw.CoordZ(126.9780, 37.5665, window.GcsApp.CONFIG.CAMERA_INIT_HEIGHT), new vw.Direction(0, -60, 0)));
map.setLogoVisible(true);
map.setNavigationZoomVisible(false);
map.start();

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
 * 이름 없음 예외 처리를 완치하고 도로명 주소를 정밀 피딩하는 통합 렌더러 (팝업 에러 수정본)
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

            ws3d.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, 250.0),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 },
                duration: 1.2
            });

            // 💥 [수정부] 함수 내부에서 레이어 팝업 엘리먼트를 동적으로 직접 참조하여 에러 원천 차단
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
 * 📋 [원본 복원] 비행 노드 테이블 리스트 UI 동적 렌더링 및 카드 형태 조작 인터페이스
 */
window.renderWaypointListUI = function () {
    var container = document.getElementById("wp_list_container");
    if (!container) return;
    
    // 안전한 데이터 참조 바인딩 (GcsApp 네임스페이스 또는 전역 배열 하이브리드 지원)
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) 
               ? window.GcsApp.state.waypointList 
               : window.waypointList;

    // 노드가 없을 때 원본 안내 문구 표출 명세 복원
    if (!list || list.length === 0) { 
        container.innerHTML = "<span style='color:#7f8c8d; display:block; text-align:center; padding-top:40px; font-size:12px;'>지도를 클릭하거나<br>JSON 파일을 불러오세요.</span>"; 
        return; 
    }
    
    container.innerHTML = "";
    
    // 💥 [원본 카드 디자인 전격 복원] 
    // 항목별 가로 정렬 플렉스 박스 레이아웃, 고도 조절 인풋 폼 및 삭제 버튼 구조 완전 복원
    list.forEach(function (wp) {
        var itemHtml = "<div class='wp-item' style='display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid #2c3e50; font-size:11px;'>" +
            "<div>" +
                "<strong style='color:#3498db;'>" + wp.id + "</strong><br>" +
                "<span style='font-size:10px; color:#bdc3c7;'>X: " + wp.lon.toFixed(4) + ", Y: " + wp.lat.toFixed(4) + "</span>" +
            "</div>" +
            "<div>" +
                "<input type='number' value='" + Math.round(wp.alt) + "' onchange='window.updateHeightFromInput(\"" + wp.id + "\", this.value)' style='width:50px; background:#111; color:#fff; border:1px solid #444; text-align:center;'> m " +
                "<button onclick='window.deleteWaypoint(\"" + wp.id + "\")' style='background:#ef5350; border:none; color:#fff; cursor:pointer; padding:2px 6px; margin-left:4px; border-radius:3px;'>X</button>" +
            "</div>" +
        "</div>";
        container.insertAdjacentHTML('beforeend', itemHtml);
    });
};







/**
• 우클릭 명령에 따른 홈, 경유지, 목적지 연산엔진
*/
window.triggerGcsCommand = function (actionType) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var rawHeight = Math.round(ws3d.viewer.camera.positionCartographic.height);
    var halvedHeight = Math.round((rawHeight <= 0 ? 300 : rawHeight) * 0.5);
    var numLon = parseFloat(window.GcsApp.state.lastRightClickLon);
    var numLat = parseFloat(window.GcsApp.state.lastRightClickLat);
    if (isNaN(numLon) || isNaN(numLat) || numLon === 0) return; var list = window.GcsApp.state.waypointList; if (actionType === "home") {
        var hData = { id: "Home", lon: numLon, lat: numLat, alt: halvedHeight };
        if (list.length > 0 && list[0].id === "Home") list[0] = hData;
        else list.unshift(hData);
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
    }// 구조 재네이밍 및 동합 동기화
    var cleanList = []; var wpCounter = 1;
    list.forEach(function (wp, idx) {
        var lbl = (idx === 0) ? "Home" : (idx === list.length - 1 && list.length > 1 && wp.id === "Destination") ? "Destination" : "WP_" + wpCounter++;
        cleanList.push({ id: lbl, lon: wp.lon, lat: wp.lat, alt: wp.alt });
    });
    window.GcsApp.state.waypointList = cleanList;
    window.waypointList = cleanList; // 글로벌 동기화 유지
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