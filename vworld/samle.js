// =========================================================================
// 🔑 1. 브이월드 오픈 API 인증키 전역 바인딩 (본인의 발급 키를 입력하세요)
// =========================================================================
const VWORLD_KEY = "307B0E17-0322-43C3-A570-59947C0FC7A1";

// 글로벌 메모리 데이터 구조 및 상태 가드 락 스위치 선언
window.waypointList = [];
window.isDrawingMode = true; 
window.isDragging = false;
window.selectedEntity = undefined;
var chk = 0; 

var map;
var options = {
    mapId: "vmap", 
    initPosition: new vw.CameraPosition(
        new vw.CoordZ(126.9780, 37.5665, 250), 
        new vw.Direction(0, -60, 0) 
    ),
    logo: true,	 
    navigation: true 
};

map = new vw.Map();
map.setOption(options);
map.setMapId("vmap");
map.setInitPosition(new vw.CameraPosition(
    new vw.CoordZ(126.9780, 37.5665, 250),
    new vw.Direction(0, -60, 0)
));

map.setLogoVisible(true);
map.setNavigationZoomVisible(false);

// =========================================================================
// 🌐 브이월드 WFS 전역 수신 콜백 함수
// =========================================================================
window.parseResponse = function (data) {
    console.log("실제 수신된 WFS 데이터 구조 디버깅:", data);
    if (!data) {
        alert("검색결과가 없습니다.");
        return;
    }
    var properties = null;
    if (data.features) {
        if (Array.isArray(data.features) && data.features.length > 0) {
            properties = data.features[0].properties;
        } else if (data.features.properties) {
            properties = data.features.properties;
        }
    }
    if (!properties) {
        console.warn("WFS 필지 properties 속성을 찾을 수 없습니다.");
        return;
    }

    let resultHtml = "";
    resultHtml += "<li> - pnu :   " + (properties.pnu || "-") + "</li>";
    resultHtml += "<li> - jibun : " + (properties.jibun || "-") + "</li>";
    resultHtml += "<li> - bchk :  " + (properties.bchk || "-") + "</li>";
    resultHtml += "<li> - std_sggcd : " + (properties.std_sggcd || "-") + "</li>";
    resultHtml += "<li> - bubun : " + (properties.bubun || "-") + "</li>";
    resultHtml += "<li> - bonbun :    " + (properties.bonbun || "-") + "</li>";
    resultHtml += "<li> - addr :  " + (properties.addr || "-") + "</li>";
    resultHtml += "<li> - ctp_nm :    " + (properties.ctp_nm || "-") + "</li>";
    resultHtml += "<li> - sig_nm :    " + (properties.sig_nm || "-") + "</li>";
    resultHtml += "<li> - emd_nm :    " + (properties.emd_nm || "-") + "</li>";
    resultHtml += "<li> - li_nm : " + (properties.li_nm || "-") + "</li>";
    resultHtml += "<li> - gosi_year : " + (properties.gosi_year || "-") + "</li>";
    resultHtml += "<li> - gosi_month :    " + (properties.gosi_month || "-") + "</li>";
    resultHtml += "<li> - jiga :  " + (properties.jiga || "-") + "</li>";

    if (jQuery('#resultDiv').length > 0) {
        jQuery('#resultDiv').html(resultHtml);
    }
};

// =========================================================================
// ✨ [sample.js 최종 마스터 - 2D/3D 제약 해제 및 무조건 우회형 우클릭 명령창 엔진]
// =========================================================================
vw.ws3dInitCallBack = function() {
    window.viewer = ws3d.viewer;
    const scene = ws3d.viewer.scene;
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

    // 🎯 [원천 봉쇄 가드 1] 크롬 브라우저 기본 흰색 창 난입을 WebGL 도화지 단에서 철저하게 전면 차단합니다!
    scene.canvas.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }, { passive: false });

    let lastHoveredFeature = undefined;

    // 🔄 [마우스 호버 하이라이트 감시 스레드]
    handler.setInputAction(function (moveEvent) {
        if (!moveEvent.endPosition) return;
        const pickedFeature = scene.pick(moveEvent.endPosition);

        if (Cesium.defined(pickedFeature) && pickedFeature.primitive && !(pickedFeature.primitive instanceof Cesium.Globe)) {
            document.body.style.cursor = "pointer";
            if (pickedFeature !== lastHoveredFeature) {
                if (lastHoveredFeature) {
                    try { lastHoveredFeature.color = Cesium.Color.WHITE; } catch(e) {}
                }
                lastHoveredFeature = pickedFeature;
                try { pickedFeature.color = Cesium.Color.YELLOW.withAlpha(0.40); } catch(e) {}
            }
        } else {
            if (lastHoveredFeature) {
                try { lastHoveredFeature.color = Cesium.Color.WHITE; } catch (e) {}
                lastHoveredFeature = undefined;
            }
            document.body.style.cursor = "default";
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    // 🎯 [원천 봉쇄 가드 2 - 무결점 3중 피킹 및 중복 매핑 완전 청소 블록]
    handler.setInputAction(function (rightClickEvent) {
        if (!rightClickEvent.position) return;
        
        const contextMousePosition = rightClickEvent.position;
        const globe = scene.globe;
        const camera = scene.camera;
        
        // 3D 지형/옥상 오차를 제어하는 3중 앵커 피킹 연산
        let pickedCartesian = scene.pickPosition(contextMousePosition);
        if (!Cesium.defined(pickedCartesian)) {
            const pickRay = camera.getPickRay(contextMousePosition);
            pickedCartesian = globe.pick(pickRay, scene);
        }
        if (!Cesium.defined(pickedCartesian)) {
            pickedCartesian = camera.pickEllipsoid(contextMousePosition, globe.ellipsoid);
        }
        
        if (Cesium.defined(pickedCartesian)) {
            const cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
            var rawLon = Cesium.Math.toDegrees(cartographic.longitude);
            var rawLat = Cesium.Math.toDegrees(cartographic.latitude);
            
            // 완벽한 숫자가 입고되었을 때만 커맨드 채널 개방
            if (!isNaN(rawLon) && !isNaN(rawLat) && rawLon !== 0 && rawLat !== 0) {
                
                // 🚨 지동 설정 앵커 변수 싱크 일치 완수!!
                window.gcsLastRightClickLon = rawLon;
                window.gcsLastRightClickLat = rawLat;
                
                console.log("🎯 [GCS 좌표 동기화] 우클릭 정밀 위경도 계산 완수 ->", rawLon, rawLat);
                
                const ctxMenu = document.getElementById("gcs_context_menu");
                if (ctxMenu) {
                    ctxMenu.style.left = contextMousePosition.x + "px";
                    ctxMenu.style.top = contextMousePosition.y + "px";
                    ctxMenu.style.display = "block"; 
                    console.log("📡 [GCS 래스터 가드] 드론 관제 메뉴창 단독 앵커 개방 완료");
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    // 🎯 [원천 봉쇄 가드 3] 마우스 좌클릭 시 우리 관제창이 닫히도록 가드 동기화
    scene.canvas.addEventListener("mousedown", function (e) {
        var ctxMenu = document.getElementById("gcs_context_menu");
        if (ctxMenu && e.button === 0) {
            ctxMenu.style.display = "none";
        }
    });

    if (typeof window.initDisasterWMSLayer === "function") { window.initDisasterWMSLayer(); }
};
// 🖥️ 리사이징 매트릭스 동기화
window.addEventListener('resize', function () {
    if (window.viewer && window.viewer.scene) {
        window.viewer.scene.requestRender();
    }
});

map.start(); 

var getBuffer = function (x, y) {
    var position = map.getCurrentPosition().position;
    var z = position.z;
    var m = 1 / (111000 / z * 1.48 * 50);
    var h = 1 / (111000 / z * 1.85 * 50);
    return [m, h];
};

var wfsEvent = function (windowPosition, ecefPosition, cartographic, featureInfo, event) {
    let lon = cartographic.longitudeDD;
    let lat = cartographic.latitudeDD;
    let wktPoint = "POINT(" + lon + " " + lat + ")";

    jQuery.ajax({
        type: "get",
        url: "https://api.vworld.kr/req/data",
        data: {
            key: VWORLD_KEY,
            domain: "127.0.0.1",
            service: "data",
            version: "2.0",
            request: "GetFeature",
            data: "LP_PA_CBND_BUBUN", 
            geomFilter: wktPoint,
            geometry: "false",
            crs: "EPSG:4326"
        },
        dataType: 'jsonp',
        jsonpCallback: "parseDataResponse",
        success: function (data) {},
        error: function (xhr, stat, err) {
            console.error("❌ 데이터 서비스 통신 에러:", stat);
        }
    });
};
window.parseDataResponse = function (data) {
    console.log("🔍 [디버깅] 브이월드 서버 응답 원본 객체 전체보기:", data);
    if (data && data.response && data.response.status === "OK") {
        if (data.response.result && data.response.result.featureCollection) {
            var features = data.response.result.featureCollection.features;
            if (features && features.length > 0) {
                var properties = features.properties; 
                let resultHtml = "";
                resultHtml += "<li> - pnu :   " + (properties.pnu || "-") + "</li>";
                resultHtml += "<li> - jibun : " + (properties.jibun || "-") + "</li>";
                resultHtml += "<li> - addr :  " + (properties.addr || "-") + "</li>";
                resultHtml += "<li> - jiga :  " + (properties.jiga || "-") + "</li>";
                jQuery('#resultDiv').html(resultHtml);
                return;
            }
        }
        jQuery('#resultDiv').html("<li>선택한 지점에 필지 속성 데이터가 없습니다.</li>");
    } else {
        let errorText = "알 수 없는 에러";
        if (data && data.response && data.response.error) {
            errorText = data.response.error.text || errorText;
        }
        jQuery('#resultDiv').html("<li style='color:red;'>서버 인증 거부: " + errorText + "</li>");
    }
};

window.vworldJijeokTileInstance = null; 

function wfsSample() {
    if (window.vworldJijeokTileInstance && map) {
        try { map.getLayers().remove(window.vworldJijeokTileInstance); } catch(e) {}
    }
    if (window.viewer && window.vworldJijeokTileInstance) {
        try { window.viewer.imageryLayers.remove(window.vworldJijeokTileInstance); } catch(e) {}
    }

    var jijeokProvider = new Cesium.WebMapServiceImageryProvider({
        url: "https://api.vworld.kr/req/wms",
        layers: "lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun", 
        tilingScheme: new Cesium.GeographicTilingScheme(),
        parameters: {
            key: VWORLD_KEY,
            domain: "127.0.0.1",
            service: "WMS",
            version: "1.3.0",
            request: "GetMap",
            styles: "lp_pa_cbnd_bubun_webgl,lp_pa_cbnd_bonbun_webgl",
            crs: "EPSG:4326",
            format: "image/png",
            transparent: "true"
        }
    });
    jijeokProvider.requestImage = function (x, y, level, request) {
        const rect = this.tilingScheme.tileXYToNativeRectangle(x, y, level);
        const baseUrl = "https://vworld.kr";
        const queryParams = [
            `key=${VWORLD_KEY}`,
            `domain=127.0.0.1`,
            `service=WMS`,
            `version=1.3.0`,
            `request=GetMap`,
            `styles=lp_pa_cbnd_bubun_webgl,lp_pa_cbnd_bonbun_webgl`,
            `crs=EPSG:4326`,
            `format=image/png`,
            `transparent=true`,
            `layers=lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun`,
            `bbox=${rect.west},${rect.south},${rect.east},${rect.north}`,
            `width=256`,
            `height=256`
        ];
        const rawTileUrl = baseUrl + "?" + queryParams.join("&");
        const proxyGateUrl = "https://map.vworld.kr/proxy.do?url=" + encodeURIComponent(rawTileUrl);

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous"; 
            img.onload = function () { resolve(img); };
            img.onerror = function () {
                const empty = document.createElement("canvas");
                empty.width = 256; empty.height = 256;
                resolve(empty);
            };
            img.src = proxyGateUrl;
        });
    };

    jijeokProvider._tileDiscardPolicy = undefined;

    if (window.viewer && window.viewer.imageryLayers) {
        window.vworldJijeokTileInstance = window.viewer.imageryLayers.addImageryProvider(jijeokProvider);
    }

    chk += 1;
    if (map && map.onClick && typeof wfsEvent === "function") {
        map.onClick.addEventListener(wfsEvent);
    }
}

window.checkLayer = function (checkboxElement, layerCode) {
    if (!checkboxElement || !ws3d || !ws3d.viewer) return;
    var isVisible = checkboxElement.checked;
    var layers = ws3d.viewer.imageryLayers;
    var targetCode = String(layerCode).toLowerCase();
    
    for (var i = 0; i < layers.length; i++) {
        var layer = layers.get(i);
        if (layer && layer.imageryProvider && layer.imageryProvider._layers) {
            var currentLayerStr = String(layer.imageryProvider._layers).toLowerCase();
            if (currentLayerStr.includes(targetCode)) {
                layer.show = isVisible; 
            }
        }
    }
};
window.switchGcsMode = function (mode) {
    const btn2d = document.getElementById("btn_2d");
    const btn3d = document.getElementById("btn_3d");
    if (!ws3d || !ws3d.viewer) return;

    const canvas = ws3d.viewer.scene.canvas;
    const centerPosition = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ray = ws3d.viewer.scene.camera.getPickRay(centerPosition);
    const targetCartesian = ws3d.viewer.scene.globe.pick(ray, ws3d.viewer.scene);

    let centerLon = 126.9780; 
    let centerLat = 37.5665;
    let currentHeight = ws3d.viewer.camera.positionCartographic.height;

    if (Cesium.defined(targetCartesian)) {
        const cartographic = Cesium.Cartographic.fromCartesian(targetCartesian);
        centerLon = Cesium.Math.toDegrees(cartographic.longitude);
        centerLat = Cesium.Math.toDegrees(cartographic.latitude);
    }

    ws3d.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    if (mode === '2D') {
        window.isDrawingMode = true;
        if (btn2d) btn2d.className = "btn-mode active";
        if (btn3d) btn3d.className = "btn-mode";
        ws3d.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, currentHeight > 0 ? currentHeight : 350.0),
            orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 },
            duration: 1.0
        });
    } else {
        window.isDrawingMode = false;
        if (btn2d) btn2d.className = "btn-mode";
        if (btn3d) btn3d.className = "btn-mode active";
        ws3d.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.002, currentHeight > 0 ? currentHeight : 300.0),
            orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-45.0), roll: 0.0 },
            duration: 1.0
        });
    }
};

function createDroneEntity(id, lon, lat, alt) {
    ws3d.viewer.entities.add({
        id: id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
        point: { pixelSize: 12, color: Cesium.Color.fromCssColorString("#00ffcc"), outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: {
            text: `${id} (${Math.round(alt)}m)`,
            font: '12px sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12),
            fillColor: Cesium.Color.WHITE, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2
        },
        polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(lon, lat, 0), Cesium.Cartesian3.fromDegrees(lon, lat, alt)],
            width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.YELLOW })
        }
    });
}
function renderWaypointListUI() {
    const container = document.getElementById("wp_list_container");
    if (!container) return;
    if (waypointList.length === 0) {
        container.innerHTML = `<span style="color:#7f8c8d; display:block; text-align:center; padding-top:40px; font-size:12px;">지도를 클릭하거나<br>JSON 파일을 불러오세요.</span>`;
        return;
    }
    container.innerHTML = "";
    waypointList.forEach((wp) => {
        const itemHtml = `
            <div class="wp-item">
                <div>
                    <strong style="color:#3498db;">${wp.id}</strong><br>
                    <span style="font-size:10px; color:#bdc3c7;">X: ${wp.lon.toFixed(4)}, Y: ${wp.lat.toFixed(4)}</span>
                </div>
                <div>
                    <input type="number" value="${Math.round(wp.alt)}" onchange="updateHeightFromInput('${wp.id}', this.value)"> m
                    <button class="btn-del" onclick="deleteWaypoint('${wp.id}')" style="margin-left:5px;">X</button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });
}

window.updateHeightFromInput = function (id, newHeight) {
    let wp = waypointList.find(w => w.id === id);
    if (wp) {
        wp.alt = parseFloat(newHeight);
        let entity = ws3d.viewer.entities.getById(id);
        if (entity) {
            entity.position = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt);
            entity.label.text = `${id} (${Math.round(wp.alt)}m)`;
            entity.polyline.positions = [Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0), Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt)];
        }
    }
};

window.deleteWaypoint = function (id) {
    ws3d.viewer.entities.removeById(id);
    waypointList = waypointList.filter(w => w.id !== id);
    const backupWps = [...waypointList];
    ws3d.viewer.entities.removeAll();
    waypointList = [];
    backupWps.forEach((wp, idx) => {
        const newId = `WP_${idx + 1}`;
        waypointList.push({ id: newId, lon: wp.lon, lat: wp.lat, alt: wp.alt });
        createDroneEntity(newId, wp.lon, wp.lat, wp.alt);
    });
    renderWaypointListUI();
};

window.exportMissionJSON = function () {
    if (waypointList.length === 0) { alert("내보낼 임무 경로 데이터가 존재하지 않습니다."); return; }
    const fileData = waypointList.map((wp, i) => ({
        index: i + 1, id: wp.id,
        longitude_X: parseFloat(wp.lon.toFixed(6)),
        latitude_Y: parseFloat(wp.lat.toFixed(6)),
        altitude_Z: parseFloat(wp.alt.toFixed(1))
    }));
    const jsonStr = JSON.stringify(fileData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vworld_gcs_mission.json";
    a.click();
};

window.importMissionJSON = function (event) {
    const file = event.target.files;
    if (!file || !file[0]) return; 
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            ws3d.viewer.entities.removeAll();
            waypointList = [];
            parsed.forEach(wp => {
                const id = wp.id || `WP_${wp.index}`;
                const lon = wp.longitude_X;
                const lat = wp.latitude_Y;
                const alt = wp.altitude_Z;
                waypointList.push({ id: id, lon: lon, lat: lat, alt: alt });
                createDroneEntity(id, lon, lat, alt);
            });
            renderWaypointListUI();
            alert(`성공적으로 파일로부터 ${waypointList.length}개의 비행 노드를 복원했습니다.`);
            ws3d.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(126.9780, 37.5665, 250.0),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-60.0), roll: 0.0 },
                duration: 2.0
            });
        } catch (err) {
            alert("올바른 형태의 GCS 임무 JSON 파일이 아닙니다.");
        }
    };
    reader.readAsText(file[0]);
};
window.gcsPanelState = { isPinned: false, isCollapsed: false, isDragging: false, startX: 0, startY: 0 };

document.addEventListener("DOMContentLoaded", function () {
    const panel = document.querySelector(".gcs-sidebar") || document.querySelector(".gcs-panel") || document.getElementById("gcs_panel_container");
    if (!panel) return;
    let header = panel.querySelector(".gcs-header") || panel.querySelector("#gcs_panel_header") || panel.querySelector("h3") || panel.firstElementChild;
    header.style.position = "relative";
    header.style.cursor = "move";

    const controlDiv = document.createElement("div");
    controlDiv.style.cssText = "position:absolute; right:10px; top:50%; transform:translateY(-50%); display:flex; gap:8px; z-index:9999;";
    controlDiv.innerHTML = `
        <button id="btn_gcs_pin" title="위치 고정" style="background:none; border:none; color:#fff; cursor:pointer;">📌</button>
        <button id="btn_gcs_toggle" title="창 접기" style="background:none; border:none; color:#fff; cursor:pointer;">🔼</button>
    `;
    header.appendChild(controlDiv);

    const pinBtn = document.getElementById("btn_gcs_pin");
    const toggleBtn = document.getElementById("btn_gcs_toggle");

    pinBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        window.gcsPanelState.isPinned = !window.gcsPanelState.isPinned;
        pinBtn.innerText = window.gcsPanelState.isPinned ? "📍" : "📌";
    });

    const children = Array.from(panel.children);
    toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        window.gcsPanelState.isCollapsed = !window.gcsPanelState.isCollapsed;
        children.forEach(child => { if (child !== header) child.style.display = window.gcsPanelState.isCollapsed ? "none" : ""; });
        toggleBtn.innerText = window.gcsPanelState.isCollapsed ? "🔽" : "🔼";
        if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
    });

    header.addEventListener("mousedown", function (e) {
        if (window.gcsPanelState.isPinned || e.target === pinBtn || e.target === toggleBtn) return;
        window.gcsPanelState.isDragging = true;
        const rect = panel.getBoundingClientRect();
        window.gcsPanelState.startX = e.clientX - rect.left;
        window.gcsPanelState.startY = e.clientY - rect.top;
        if (window.viewer && window.viewer.scene) window.viewer.scene.screenSpaceCameraController.enableInputs = false;
    });

    document.addEventListener("mousemove", function (e) {
        if (!window.gcsPanelState.isDragging) return;
        let newLeft = e.clientX - window.gcsPanelState.startX;
        let newTop = e.clientY - window.gcsPanelState.startY;
        panel.style.position = "fixed"; panel.style.left = newLeft + "px"; panel.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", function () {
        if (window.gcsPanelState.isDragging) {
            window.gcsPanelState.isDragging = false;
            if (window.viewer && window.viewer.scene) window.viewer.scene.screenSpaceCameraController.enableInputs = true;
        }
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const mapContainer = document.getElementById("vmap");
    if (!mapContainer) return;
    const searchWrapper = document.createElement("div");
    searchWrapper.id = "vworld_search_wrapper";
    searchWrapper.style.cssText = "position: absolute; left: 20px; top: 20px; z-index: 1000; display: flex; flex-direction: column; width: 320px; background: rgba(30, 39, 46, 0.95); border-radius: 8px; overflow: hidden;";
    searchWrapper.innerHTML = `
        <div style="display: flex; align-items: center; padding: 10px; background: #2c3e50;">
            <input type="text" id="vworld_search_input" placeholder="명칭, 도로명, 지번 통합 검색..." style="flex: 1; height: 32px; padding: 0 10px; border-radius: 4px; border:none;" />
            <button id="vworld_search_btn" style="width: 50px; height: 32px; margin-left: 6px; background: #3498db; color: #fff; border: none; border-radius: 4px; cursor: pointer;">검색</button>
        </div>
        <ul id="vworld_search_result_list" style="list-style: none; margin: 0; padding: 0; max-height: 250px; overflow-y: auto; background: #222f3e; display: none;"></ul>
    `;
    mapContainer.appendChild(searchWrapper);

    const input = document.getElementById("vworld_search_input");
    const btn = document.getElementById("vworld_search_btn");
    btn.addEventListener("click", executeIntegratedSearch);
    input.addEventListener("keypress", function (e) { if (e.key === "Enter") executeIntegratedSearch(); });
});

function executeIntegratedSearch() {
    const query = document.getElementById("vworld_search_input").value.trim();
    const resultList = document.getElementById("vworld_search_result_list");
    if (!query) { alert("검색어를 입력하세요."); return; }
    resultList.innerHTML = `<li style="padding: 12px; color: #ccc; text-align: center;">탐색 중...</li>`;
    resultList.style.display = "block";

    jQuery.ajax({
        type: "get",
        url: "https://api.vworld.kr/req/search",
        data: { key: VWORLD_KEY, domain: "127.0.0.1", service: "search", version: "2.0", request: "search", query: query, type: "PLACE", format: "json" },
        dataType: "jsonp",
        jsonpCallback: "parsePoiSearchResponse",
        success: function (data) {
            if (data.response && data.response.status === "OK" && data.response.result?.items) {
                renderSearchResults(data.response.result.items);
            } else {
                resultList.innerHTML = `<li style="padding: 12px; color: red; text-align: center;">결과가 없습니다.</li>`;
            }
        }
    });
}

function renderSearchResults(items) {
    const resultList = document.getElementById("vworld_search_result_list");
    if (!resultList) return;
    resultList.innerHTML = "";
    items.forEach((item) => {
        const title = item.title;
        const lon = parseFloat(item.point.x); const lat = parseFloat(item.point.y);
        const li = document.createElement("li");
        li.style.cssText = "padding: 10px; border-bottom: 1px solid #34495e; color:#fff; cursor:pointer;";
        li.innerHTML = `<div>${title}</div>`;
        li.addEventListener("click", function () {
            if (!ws3d || !ws3d.viewer) return;
            window.isDrawingMode = true;
            const oldSearchPoint = ws3d.viewer.entities.getById("vworld_search_marker_pin");
            if (oldSearchPoint) { ws3d.viewer.entities.remove(oldSearchPoint); }

            ws3d.viewer.entities.add({
                id: "vworld_search_marker_pin", position: Cesium.Cartesian3.fromDegrees(lon, lat, 0.0),
                point: { pixelSize: 18, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY }
            });
            ws3d.viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, 250.0),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 },
                duration: 1.2
            });
            resultList.style.display = "none";
        });
        resultList.appendChild(li);
    });
}

if (!window.vworldFixedPopups) window.vworldFixedPopups = [];
window.vworldHoverTooltip = window.vworldHoverTooltip || { element: null, position: null, props: null };

window.handleJiJeokIntegratedToggle = function (checkbox) {
    if (checkbox.checked) { wfsSample(); } else {
        if (window.viewer && window.vworldJijeokTileInstance) {
            window.viewer.imageryLayers.remove(window.vworldJijeokTileInstance);
            window.vworldJijeokTileInstance = null;
        }
        jQuery('#resultDiv').html("<li>연속지적도 해제됨</li>");
    }
};

window.isBuildingPopupEngineActive = false;
window.toggleBuildingPopupEngine = function(checkbox) {
    window.isBuildingPopupEngineActive = checkbox.checked;
};
