// =========================================================================
// 🛸 [GCS 스마트 관제 3D 벡터 레이어 가동 엔진 - 인터록 통합 최종 마스터 마감본]
// =========================================================================

// 목적지/경유지 내려다보이는 높이 비율 전역 변수 마스터 스위치
var GCS_LOOKING_DOWN_RATIO = 3.5;

window.GcsApp = window.GcsApp || {};
window.GcsApp.state = window.GcsApp.state || {};

window.GcsApp.SIM_CONFIG = {
    TIME_WAIT: 1.0,
    TIME_CLIMB: 5.0,
    TIME_HOVER_CHECK: 0.5,
    TIME_CRUISE_STEP: 8,
    TIME_NODE_HOVER: 2
};

window.gcsSimulatedDroneEntity = null;
window.gcsMultiCamRenderListener = null;
window.gcsCameraTrackingModeActive = true;
window.isGcsLayoutSwapped = false;
window.gcsHudPositionMemory = { left: "auto", top: "auto", right: "20px", bottom: "20px" };

// 💥 [2단계 시뮬레이션 작동 제어 래칭 변수]
window.gcsAutoNodesPreparedGuard = false;

// =========================================================================
// 🎯 [GCS 유일 관제 표준 함수 - 동적 시작값 자동 파싱 완치본]
// =========================================================================
window.getGcsDestinationAltitude = function (baseFloorHeight) {
    var currentPanelReadingHeight = 150.0;
    if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
        var camHeight = ws3d.viewer.camera.positionCartographic.height;
        if (!isNaN(camHeight) && camHeight > 50) {
            currentPanelReadingHeight = Math.round(camHeight * 0.4);
        }
    }
    var infoBarEl = document.getElementById("vmap_info_bar") || document.querySelector(".cesium-viewer-bottom");
    var allHtmlTexts = document.body.innerText || "";
    if (infoBarEl && infoBarEl.innerText.indexOf("내려다보는") !== -1) {
        var barMatch = infoBarEl.innerText.match(/내려다보는\s*높이\s*([\d\.]+)\s*m/i);
        if (barMatch && barMatch) currentPanelReadingHeight = parseFloat(barMatch[1]);
    } else if (allHtmlTexts.indexOf("내려다보는 높이") !== -1) {
        var globalMatch = allHtmlTexts.match(/내려다보는\s*높이\s*([\d\.]+)\s*m/i);
        if (globalMatch && globalMatch) currentPanelReadingHeight = parseFloat(globalMatch[1]);
    }
    if (isNaN(currentPanelReadingHeight) || currentPanelReadingHeight <= 5) {
        currentPanelReadingHeight = 150.0;
    }
    var activeRatio = parseFloat(window.GCS_LOOKING_DOWN_RATIO || GCS_LOOKING_DOWN_RATIO || 5);
    var finalOffset = Math.round(currentPanelReadingHeight / activeRatio);
    return Math.round(parseFloat(baseFloorHeight) + finalOffset);
};

// =========================================================================
// 🛸 Three.js 입체 관제 레이더 인프라
// =========================================================================
window.GcsThreeRadar = window.GcsThreeRadar || {
    scene: null, camera: null, renderer: null, flightLine: null, droneMarker: null, droneVerticalLine: null, gridHelper: null, isInitialized: false, useFallback2D: false,
    cameraState: { isTargeting: false, theta: Math.PI / 4, phi: Math.PI / 3, radius: 70, lastMouseX: 0, lastMouseY: 0 },
    init: function () {
        if (this.isInitialized) return; var canvas = document.getElementById("gcs_hud_minimap_canvas"); if (!canvas) return;
        var width = canvas.clientWidth || 360; var height = canvas.clientHeight || 150;
        if (typeof THREE !== "undefined" && typeof THREE.Scene === "function") {
            try {
                this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0f19);
                this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000); this.updateCameraPosition();
                this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
                this.renderer.setSize(width, height, false); this.gridHelper = new THREE.GridHelper(100, 20, 0x00ffcc, 0x233142); this.gridHelper.position.y = -20; this.scene.add(this.gridHelper);
                this.flightLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 3 })); this.scene.add(this.flightLine);
                this.droneVerticalLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xff007f, dashSize: 1, gapSize: 1 })); this.scene.add(this.droneVerticalLine);
                this.droneMarker = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff007f })); this.scene.add(this.droneMarker);
                this.bindCameraInteractionEvents(canvas); this.useFallback2D = false;
            } catch (err) { this.useFallback2D = true; }
        } else { this.useFallback2D = true; }
        this.isInitialized = true;
    },
    updateCameraPosition: function () { if (!this.camera) return; var s = this.cameraState; var x = s.radius * Math.sin(s.phi) * Math.sin(s.theta); var y = s.radius * Math.cos(s.phi) + s.radius * 0.2; var z = s.radius * Math.sin(s.phi) * Math.cos(s.theta); this.camera.position.set(x, y, z); this.camera.lookAt(0, 0, 0); },
    bindCameraInteractionEvents: function (canvas) {
        var self = this; var s = this.cameraState;
        canvas.addEventListener('mousedown', function (e) { s.isTargeting = true; s.lastMouseX = e.clientX; s.lastMouseY = e.clientY; });
        window.addEventListener('mousemove', function (e) { if (!s.isTargeting) return; var deltaX = e.clientX - s.lastMouseX; var deltaY = e.clientY - s.lastMouseY; s.theta -= deltaX * 0.007; s.phi -= deltaY * 0.007; if (s.phi < 0.1) s.phi = 0.1; if (s.phi > Math.PI / 2 + 0.2) s.phi = Math.PI / 2 + 0.2; s.lastMouseX = e.clientX; s.lastMouseY = e.clientY; self.updateCameraPosition(); });
        window.addEventListener('mouseup', function () { s.isTargeting = false; });
        canvas.addEventListener('wheel', function (e) { e.preventDefault(); s.radius += e.deltaY * 0.05; if (s.radius < 20) s.radius = 20; if (s.radius > 200) s.radius = 200; self.updateCameraPosition(); }, { passive: false });
    },
    update: function (waypointList, liveLon, liveLat, liveAlt) {
        var canvas = document.getElementById("gcs_hud_minimap_canvas"); if (!this.isInitialized || !canvas) return;
        var activeList = (waypointList && waypointList.length > 0) ? waypointList : null;
        if (!activeList && window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) {
            activeList = window.GcsApp.state.waypointList;
        }
        if (!activeList) activeList = window.waypoint || window.waypointList || [];
        if (activeList.length === 0) return;
        if (this.useFallback2D) { this.renderFallback2D(canvas, activeList, liveLon, liveLat, liveAlt); return; }
        var minLon = 180, maxLon = -180, minLat = 90, maxLat = -180;
        for (var m = 0; m < activeList.length; m++) { var p = activeList[m]; if (!p) continue; if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon; if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat; }
        var lonSpan = (maxLon - minLon) <= 0 ? 0.0001 : (maxLon - minLon); var latSpan = (maxLat - minLat) <= 0 ? 0.0001 : (maxLat - minLat);
        var to3DX = function (l) { return ((l - minLon) / lonSpan) * 80 - 40; }; var to3DZ = function (t) { return ((t - minLat) / latSpan) * 40 - 20; }; var to3DY = function (a) { var clampedAlt = parseFloat(a) || 150.0; return -20 + (clampedAlt / 500) * 40; };
        var linePoints = []; activeList.forEach(function (wp) { if (!wp) return; var wx = to3DX(wp.lon); var wz = to3DZ(wp.lat); var wy = to3DY(wp.alt); linePoints.push(wx, wy, wz); });
        if (this.flightLine && this.flightLine.geometry) { this.flightLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3)); this.flightLine.geometry.attributes.position.needsUpdate = true; }
        var currentDroneLon = (liveLon && liveLon !== 0) ? liveLon : activeList.lon; var currentDroneLat = (liveLat && liveLat !== 0) ? liveLat : activeList.lat; var currentDroneAlt = (liveAlt && liveAlt !== 0) ? liveAlt : (activeList.alt || 150.0);
        var curX = to3DX(currentDroneLon); var curY = to3DY(currentDroneAlt); var curZ = to3DZ(currentDroneLat);
        if (this.droneMarker) { this.droneMarker.position.set(curX, curY, curZ); }
        if (this.droneVerticalLine && this.droneVerticalLine.geometry) { this.droneVerticalLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([curX, curY, curZ, curX, -20, curZ], 3)); this.droneVerticalLine.geometry.attributes.position.needsUpdate = true; }
        if (this.renderer && this.scene && this.camera) { this.renderer.render(this.scene, this.camera); }
    },
    renderFallback2D: function (canvas, waypointList, liveLon, liveLat, liveAlt) { var ctx = canvas.getContext("2d"); if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0b0f19"; ctx.fillRect(0, 0, canvas.width, canvas.height); },
    resize: function () { var canvas = document.getElementById("gcs_hud_minimap_canvas"); if (!this.isInitialized || this.useFallback2D || !this.renderer || !canvas) return; this.camera.aspect = canvas.clientWidth / canvas.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); }
};

// =========================================================================
// 🛰️ [Three.js 레이더 NaN 오류 완치 패치본]
// =========================================================================
window.GcsThreeRadar.update = function (waypointList, liveLon, liveLat, liveAlt) {
    var canvas = document.getElementById("gcs_hud_minimap_canvas");
    if (!this.isInitialized || !canvas) return;

    var activeList = (waypointList && waypointList.length > 0) ? waypointList : null;
    if (!activeList && window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) {
        activeList = window.GcsApp.state.waypointList;
    }
    if (!activeList) activeList = window.waypoint || window.waypointList || [];
    if (activeList.length === 0) return;

    if (this.useFallback2D) {
        this.renderFallback2D(canvas, activeList, liveLon, liveLat, liveAlt);
        return;
    }

    var minLon = 180, maxLon = -180, minLat = 90, maxLat = -180;
    var validNodesExist = false;

    // 🔒 유효한 위경도 숫자 데이터만 필터링 스캔
    for (var m = 0; m < activeList.length; m++) {
        var p = activeList[m];
        if (!p || isNaN(parseFloat(p.lon)) || isNaN(parseFloat(p.lat))) continue;

        var pLon = parseFloat(p.lon);
        var pLat = parseFloat(p.lat);

        if (pLon < minLon) minLon = pLon;
        if (pLon > maxLon) maxLon = pLon;
        if (pLat < minLat) minLat = pLat;
        if (pLat > maxLat) maxLat = pLat;
        validNodesExist = true;
    }

    // 데이터가 오염되었거나 노드가 부족할 경우 안전 리턴하여 NaN 사출 차단
    if (!validNodesExist) return;

    // 🔒 [완치 포인트] 경계 제원 분모가 0이 되거나 가상 타일 축이 튕겨 숫자가 파괴되는 현상 영구 락 실드
    var lonSpan = (maxLon - minLon);
    var latSpan = (maxLat - minLat);
    if (isNaN(lonSpan) || lonSpan <= 0) lonSpan = 0.0001;
    if (isNaN(latSpan) || latSpan <= 0) latSpan = 0.0001;

    var to3DX = function (l) { return ((parseFloat(l) - minLon) / lonSpan) * 80 - 40; };
    var to3DZ = function (t) { return ((parseFloat(t) - minLat) / latSpan) * 40 - 20; };
    var to3DY = function (a) {
        var clampedAlt = parseFloat(a);
        if (isNaN(clampedAlt) || clampedAlt <= 0) clampedAlt = 150.0;
        return -20 + (clampedAlt / 500) * 40;
    };

    var linePoints = [];
    activeList.forEach(function (wp) {
        if (!wp || isNaN(parseFloat(wp.lon)) || isNaN(parseFloat(wp.lat))) return;
        var wx = to3DX(wp.lon);
        var wz = to3DZ(wp.lat);
        var wy = to3DY(wp.alt);

        // 최종 3D 좌표 스레드 안에 NaN이 절대 침투하지 못하도록 재검증 가드
        if (!isNaN(wx) && !isNaN(wy) && !isNaN(wz)) {
            linePoints.push(wx, wy, wz);
        }
    });

    if (linePoints.length >= 6 && this.flightLine && this.flightLine.geometry) {
        this.flightLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
        this.flightLine.geometry.attributes.position.needsUpdate = true;
        // 🔒 computeBoundingSphere 내의 NaN 감지 엔진 경고를 근본적으로 소멸
        this.flightLine.geometry.computeBoundingSphere();
    }

    var currentDroneLon = (liveLon && liveLon !== 0 && !isNaN(parseFloat(liveLon))) ? parseFloat(liveLon) : parseFloat(activeList[0]?.lon || 126.9194);
    var currentDroneLat = (liveLat && liveLat !== 0 && !isNaN(parseFloat(liveLat))) ? parseFloat(liveLat) : parseFloat(activeList[0]?.lat || 37.4608);
    var currentDroneAlt = (liveAlt && liveAlt !== 0 && !isNaN(parseFloat(liveAlt))) ? parseFloat(liveAlt) : parseFloat(activeList[0]?.alt || 150.0);

    var curX = to3DX(currentDroneLon);
    var curY = to3DY(currentDroneAlt);
    var curZ = to3DZ(currentDroneLat);

    if (!isNaN(curX) && !isNaN(curY) && !isNaN(curZ)) {
        if (this.droneMarker) {
            this.droneMarker.position.set(curX, curY, curZ);
        }
        if (this.droneVerticalLine && this.droneVerticalLine.geometry) {
            this.droneVerticalLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([curX, curY, curZ, curX, -20, curZ], 3));
            this.droneVerticalLine.geometry.attributes.position.needsUpdate = true;
            this.droneVerticalLine.geometry.computeBoundingSphere();
        }
    }

    if (this.renderer && this.scene && this.camera) {
        this.renderer.clear(); // 잔상 제거 및 세션 세척
        this.renderer.render(this.scene, this.camera);
    }
};



// =========================================================================
// 🏢 [GCS 지형 스캔 최적화 엔진]
// =========================================================================
// window.gcsExecuteTerrainOptimizationReturnData = function () {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return null;
//     var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
//     if (!list || !Array.isArray(list) || list.length < 2) return null;
//     var recommendedSafeAltitude = 194.0;
//     var maxTerrainHeight = 0;
//     var scene = ws3d.viewer.scene;
//     var SAFETY_MARGIN = 60.0;
//     var scanSegments = 5;
//     for (var i = 1; i < list.length; i++) {
//         var prevNode = list[i - 1]; var currentNode = list[i];
//         if (!prevNode || !currentNode) continue;
//         for (var j = 0; j <= scanSegments; j++) {
//             var ratio = j / scanSegments;
//             var sampleLon = prevNode.lon + (currentNode.lon - prevNode.lon) * ratio;
//             var sampleLat = prevNode.lat + (currentNode.lat - prevNode.lat) * ratio;
//             var radLon = Cesium.Math.toRadians(sampleLon);
//             var radLat = Cesium.Math.toRadians(sampleLat);
//             var cartoInstance = new Cesium.Cartographic(radLon, radLat);
//             var pureTerrainHeight = scene.globe ? (scene.globe.getHeight(cartoInstance) || 0) : 0;
//             if (pureTerrainHeight <= 0 || isNaN(pureTerrainHeight)) pureTerrainHeight = 86.0;
//             var currentHighestAtPoint = pureTerrainHeight;
//             var rayOrigin = Cesium.Cartesian3.fromDegrees(sampleLon, sampleLat, 320.0);
//             var surfaceNormal = scene.globe.ellipsoid.geodeticSurfaceNormal(rayOrigin, new Cesium.Cartesian3());
//             var negativeNormal = Cesium.Cartesian3.negate(surfaceNormal, new Cesium.Cartesian3());
//             var ray = new Cesium.Ray(rayOrigin, negativeNormal);
//             try {
//                 var pickedIntersection = scene.pickFromRay(ray);
//                 if (Cesium.defined(pickedIntersection) && Cesium.defined(pickedIntersection.position)) {
//                     var cartoIntersection = Cesium.Cartographic.fromCartesian(pickedIntersection.position);
//                     if (cartoIntersection.height > pureTerrainHeight && cartoIntersection.height < (pureTerrainHeight + 130.0) && cartoIntersection.height < 280.0) {
//                         currentHighestAtPoint = cartoIntersection.height;
//                     }
//                 }
//             } catch (rayErr) {
//                 currentHighestAtPoint = pureTerrainHeight;
//             }
//             if (currentHighestAtPoint > maxTerrainHeight && currentHighestAtPoint < 400.0) {
//                 maxTerrainHeight = currentHighestAtPoint;
//             }
//         }
//     }
//     recommendedSafeAltitude = Math.round(maxTerrainHeight + SAFETY_MARGIN);
//     if (recommendedSafeAltitude < 140 || recommendedSafeAltitude > 350) recommendedSafeAltitude = 194;
//     return {
//         maxApartmentHeight: Math.round(maxTerrainHeight || 0),
//         maxMountainHeight: Math.round(maxTerrainHeight),
//         recommendedSafeAltitude: recommendedSafeAltitude
//     };
// };

window.gcsExecuteTerrainOptimizationReturnData = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return null;
    var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
    if (!list || !Array.isArray(list) || list.length < 2) return null;

    var recommendedSafeAltitude = 194.0;
    var maxTerrainHeight = 0;
    var scene = ws3d.viewer.scene;
    var SAFETY_MARGIN = 60.0;
    var scanSegments = 5;

    // 지형 및 아파트 옥상 모델링 매시 조밀 스캔 루프... (기존 스캔 로직 보존)
    for (var i = 1; i < list.length; i++) {
        var prevNode = list[i - 1]; var currentNode = list[i];
        if (!prevNode || !currentNode) continue;
        for (var j = 0; j <= scanSegments; j++) {
            var ratio = j / scanSegments;
            var sampleLon = prevNode.lon + (currentNode.lon - prevNode.lon) * ratio;
            var sampleLat = prevNode.lat + (currentNode.lat - prevNode.lat) * ratio;
            var radLon = Cesium.Math.toRadians(sampleLon);
            var radLat = Cesium.Math.toRadians(sampleLat);
            var cartoInstance = new Cesium.Cartographic(radLon, radLat);
            var pureTerrainHeight = scene.globe ? (scene.globe.getHeight(cartoInstance) || 0) : 0;
            if (pureTerrainHeight <= 0 || isNaN(pureTerrainHeight)) pureTerrainHeight = 86.0;
            var currentHighestAtPoint = pureTerrainHeight;
            var rayOrigin = Cesium.Cartesian3.fromDegrees(sampleLon, sampleLat, 320.0);
            var surfaceNormal = scene.globe.ellipsoid.geodeticSurfaceNormal(rayOrigin, new Cesium.Cartesian3());
            var negativeNormal = Cesium.Cartesian3.negate(surfaceNormal, new Cesium.Cartesian3());
            var ray = new Cesium.Ray(rayOrigin, negativeNormal);
            try {
                var pickedIntersection = scene.pickFromRay(ray);
                if (Cesium.defined(pickedIntersection) && Cesium.defined(pickedIntersection.position)) {
                    var cartoIntersection = Cesium.Cartographic.fromCartesian(pickedIntersection.position);
                    if (cartoIntersection.height > pureTerrainHeight && cartoIntersection.height < (pureTerrainHeight + 130.0) && cartoIntersection.height < 280.0) {
                        currentHighestAtPoint = cartoIntersection.height;
                    }
                }
            } catch (rayErr) { currentHighestAtPoint = pureTerrainHeight; }
            if (currentHighestAtPoint > maxTerrainHeight && currentHighestAtPoint < 400.0) {
                maxTerrainHeight = currentHighestAtPoint;
            }
        }
    }
    recommendedSafeAltitude = Math.round(maxTerrainHeight + SAFETY_MARGIN);
    if (recommendedSafeAltitude < 140 || recommendedSafeAltitude > 350) recommendedSafeAltitude = 194;

    // 💥 [관제 기획 핵심 피딩] : 최적화 분석 시 출발 드론의 상대/절대 방위각 실시간 마스터 연산 수식 결착
    var homeNode = list[0];
    var destNode = list[list.length - 1];
    var compassString = "N/A";
    var angleDeg = 0;

    if (homeNode && destNode) {
        var dLon = parseFloat(destNode.lon) - parseFloat(homeNode.lon);
        var dLat = parseFloat(destNode.lat) - parseFloat(homeNode.lat);
        var angleRad = Math.atan2(dLon, dLat);
        angleDeg = Math.round(angleRad * (180 / Math.PI));
        if (angleDeg < 0) angleDeg += 360;

        var directions = ["N (정북)", "NE (북동)", "E (정동)", "SE (남동)", "S (정남)", "SW (남서)", "W (정서)", "NW (북서)", "N (정북)"];
        compassString = directions[Math.round(angleDeg / 45)];
    }

    return {
        maxApartmentHeight: Math.round(maxTerrainHeight || 0),
        maxMountainHeight: Math.round(maxTerrainHeight),
        recommendedSafeAltitude: recommendedSafeAltitude,
        droneTakeoffHeadingDeg: angleDeg,       // 숫자 각도 제원 (예: 35)
        droneTakeoffCompassStr: compassString   // 문자 방위 제원 (예: "NE (북동)")
    };
};



// =========================================================================
// 🛫 [최종 통합본] 수동 경유지 보존 + 최적화 WP 반영 + 자율항행 시뮬레이션 엔진
// =========================================================================
window.startGcsDroneSimulation = function () {
    if (window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
        if (typeof window.GcsThreeRadar.init === "function") window.GcsThreeRadar.init();
    }
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    if (!list || !Array.isArray(list) || list.length < 2) {
        alert("⚠️ 출발지(Home)와 최종 목적지(Destination)를 구성해 주세요.");
        return;
    }

    var homeNode = list.find(function (n) { return n && String(n.id).toLowerCase() === "home"; });
    var destNode = list.find(function (n) { return n && n.id === "Destination"; });
    if (!homeNode || !destNode) return;

    // 1. 이미 최적화 WP(WP_AUTO_*)가 생성되어 있다면 재시작 시 중복 알림창 없이 바로 비행 시작
    var alreadyOptimized = list.some(function (n) { return n && String(n.id).startsWith("WP_AUTO_"); });

    if (window.gcsAutoNodesPreparedGuard === false && !alreadyOptimized) {
        if (typeof window.runGcsRouteOptimization === "function") window.runGcsRouteOptimization();

        list = window.GcsApp.state.waypointList;
        var updatedHome = list.find(function (n) { return n && n.id === "Home"; });
        var safeCruiseAlt = updatedHome ? parseFloat(updatedHome.alt) : 232.0;

        var middleNodes = list.filter(function (n) { return n && n.id !== "Home" && n.id !== "Destination"; });
        var wpSummaryLines = middleNodes.map(function (wp) {
            return `• [${wp.id}] 고도: ${Math.round(wp.alt)}m (${wp.address || "경유 공역"})`;
        });

        var briefingMsg =
            `🛰️ [GCS 경로 최적화 및 비행 궤적 최종 점검]\n` +
            `=======================================\n` +
            `• 출발지(Home) 상승 고도: ${Math.round(safeCruiseAlt)}m\n` +
            `• 목적지(Destination) 착륙 고도: ${Math.round(destNode.alt)}m (유지)\n` +
            `• 총 중간 경유지(WP): ${middleNodes.length}개\n\n` +
            (wpSummaryLines.length > 0 ? wpSummaryLines.join("\n") + "\n\n" : "") +
            `=======================================\n` +
            `좌측 카드 목록과 3D 경로선을 확인하신 후\n` +
            `[시뮬레이션 시작] 버튼을 한 번 더 누르시면 비행이 시작됩니다.`;

        window.gcsAutoNodesPreparedGuard = true;
        alert(briefingMsg);
        return;
    }

    // 2. [핵심 완치] 재시작 시 이전 비행 상태 및 카메라 추적 모드 완전 초기화
    window.gcsAutoNodesPreparedGuard = false;
    window.gcsCameraTrackingModeActive = true;       // 첫 비행 종료 시 false로 꺼진 카메라 추적 다시 활성화
    window.gcsSmoothCameraHeading = undefined;       // 이전 비행의 마지막 방위각 캐시 초기화
    window.gcsHoverStartHeading = undefined;
    window.gcsLastValidHeadingCache = undefined;
    window.gcsLockedCruiseHeadingBackup = undefined;


    window.gcsDroneLiveState = {
        isTakeoffConfirmedGuard: true,
        currentStageString: "takeoff_ready",         // "landing_done" 상태를 "takeoff_ready"로 강제 리셋
        isHoverViewTriggered: false,
        isDestinationViewTriggered: false
    };


    list.forEach(function (node) {
        if (!node || !node.id) return;
        node.alt = parseFloat(node.alt);
        node.altitude_Z = node.alt;
    });

    window.gcsDroneLiveState = window.gcsDroneLiveState || {};
    window.gcsDroneLiveState.isTakeoffConfirmedGuard = true;
    window.gcsDroneLiveState.currentStageString = "takeoff_ready";
    window.gcsDroneLiveState.isHoverViewTriggered = false;
    window.gcsDroneLiveState.isDestinationViewTriggered = false;

    var startTime = Cesium.JulianDate.fromDate(new Date());
    window.gcsLiveStartTimeRef = startTime;

    mainViewer.trackedEntity = undefined;
    mainViewer.clock.shouldAnimate = false;
    if (window.gcsMultiCamRenderListener) { mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener); }
    if (window.gcsSimulatedDroneEntity) { mainViewer.entities.remove(window.gcsSimulatedDroneEntity); window.gcsSimulatedDroneEntity = null; }
    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();

    var propertyPosition = new Cesium.SampledPositionProperty();
    var propertyOrientation = new Cesium.SampledProperty(Cesium.Quaternion);
    propertyPosition.setInterpolationOptions({
        interpolationDegree: 1,
        interpolationAlgorithm: Cesium.LinearApproximation
    });

    var destNodeObj = list[list.length - 1];
    var flightPathPoints = list.slice(1, list.length - 1);

    var actualHomeFlightAlt = parseFloat(homeNode.alt);
    window.gcsLiveCurrentCruiseAltRef = actualHomeFlightAlt;

    var homeCartesian = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, actualHomeFlightAlt);
    var firstTargetNode = (flightPathPoints.length > 0) ? flightPathPoints[0] : destNodeObj;
    var firstTargetCartesian = Cesium.Cartesian3.fromDegrees(
        parseFloat(firstTargetNode.lon),
        parseFloat(firstTargetNode.lat),
        parseFloat(firstTargetNode.alt || actualHomeFlightAlt)
    );

    var targetHeadingRadian = 0.0;
    try {
        var invMatrix = Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(homeCartesian), new Cesium.Matrix4());
        if (Cesium.defined(invMatrix)) {
            var localTarget = Cesium.Matrix4.multiplyByPoint(invMatrix, firstTargetCartesian, new Cesium.Cartesian3());
            targetHeadingRadian = Math.atan2(localTarget.x, localTarget.y);
        }
    } catch (e) { }
    if (isNaN(targetHeadingRadian) || !isFinite(targetHeadingRadian)) targetHeadingRadian = 0.0;
    window.gcsLiveHeadingRef = targetHeadingRadian;

    var qInitialNorth = Cesium.Transforms.headingPitchRollQuaternion(Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, 0.0), new Cesium.HeadingPitchRoll(0.0, 0.0, 0.0));
    var qTakeoffUp = Cesium.Transforms.headingPitchRollQuaternion(homeCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0));

    var t_wait = 1.0;
    var t_climb = 5.0;
    var t_hover = 4.5;
    var timeSum = 0.0;
    var homeBaseH = parseFloat(homeNode.roofBase) || 0;

    propertyPosition.addSample(startTime, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeBaseH));
    propertyOrientation.addSample(startTime, qInitialNorth);
    timeSum += t_wait;

    var timeMotorReady = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(timeMotorReady, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeBaseH));
    propertyOrientation.addSample(timeMotorReady, qInitialNorth);

    var climbSteps = 4;
    for (var step = 1; step <= climbSteps; step++) {
        var ratio = step / climbSteps;
        var t_interp = t_wait + (t_climb * ratio);
        var h_interp = homeBaseH + ((actualHomeFlightAlt - homeBaseH) * ratio);
        var timeClimbNode = Cesium.JulianDate.addSeconds(startTime, t_interp, new Cesium.JulianDate());
        propertyPosition.addSample(timeClimbNode, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, h_interp));
        propertyOrientation.addSample(timeClimbNode, qInitialNorth);
    }
    timeSum += t_climb;

    var timeClimbEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(timeClimbEnd, homeCartesian);
    propertyOrientation.addSample(timeClimbEnd, qTakeoffUp);

    var startHoverTimeRef = timeSum;
    timeSum += t_hover;
    var timeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(timeHoverEnd, homeCartesian);
    propertyOrientation.addSample(timeHoverEnd, qTakeoffUp);
    window.gcsHoverScheduleTimestamps = [{ name: "Home_Hover", start: startHoverTimeRef, end: timeSum }];



    // // 수동 경유지 및 자동 추가된 경유지 모두 순회하며 궤적 샘플링
    // for (var j = 0; j < flightPathPoints.length; j++) {
    //     var node = flightPathPoints[j];
    //     if (!node || isNaN(parseFloat(node.lon)) || isNaN(parseFloat(node.lat))) continue;

    //     // [수정] 목적지 좌표와 동일한 직상공 가드 WP인 경우 중간 1초 대기를 생략하여 즉시 목적지 호버링으로 연결
    //     var isSameAsDest = (Math.abs(parseFloat(node.lon) - parseFloat(destNodeObj.lon)) < 0.00001 &&
    //         Math.abs(parseFloat(node.lat) - parseFloat(destNodeObj.lat)) < 0.00001);
    //     if (isSameAsDest) continue;


    //     timeSum += 4.0;
    //     var nodeTimeArrival = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    //     var targetNodeAlt = parseFloat(node.alt) || actualHomeFlightAlt;
    //     var exactWpCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(node.lon), parseFloat(node.lat), targetNodeAlt);
    //     propertyPosition.addSample(nodeTimeArrival, exactWpCartesian);
    //     propertyOrientation.addSample(nodeTimeArrival, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));

    //     var startWpHoverTime = timeSum;
    //     timeSum += 1.0;
    //     var nodeTimeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    //     propertyPosition.addSample(nodeTimeHoverEnd, exactWpCartesian);
    //     propertyOrientation.addSample(nodeTimeHoverEnd, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
    //     window.gcsHoverScheduleTimestamps.push({ name: node.id, start: startWpHoverTime, end: timeSum });
    // }

    // // 목적지 직상공 천장 진입 및 호버링
    // timeSum += 4.0;
    // var destTopAirspaceTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    // var lastWpNode = flightPathPoints.length > 0 ? flightPathPoints[flightPathPoints.length - 1] : homeNode;
    // var calculatedTopAlt = parseFloat(lastWpNode.alt) || actualHomeFlightAlt;
    // var destTopAirspaceCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), calculatedTopAlt);
    // propertyPosition.addSample(destTopAirspaceTime, destTopAirspaceCartesian);
    // propertyOrientation.addSample(destTopAirspaceTime, Cesium.Transforms.headingPitchRollQuaternion(destTopAirspaceCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));

    // var destTopHoverStart = timeSum;
    // timeSum += 3.5;
    // var destTopHoverEndTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    // propertyPosition.addSample(destTopHoverEndTime, destTopAirspaceCartesian);
    // propertyOrientation.addSample(destTopHoverEndTime, Cesium.Transforms.headingPitchRollQuaternion(destTopAirspaceCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
    // window.gcsHoverScheduleTimestamps.push({ name: "Dest_Top_Hover", start: destTopHoverStart, end: timeSum });

    // // 최종 목적지(원래 설정된 착륙 고도)로 수직 하강 착륙
    // timeSum += 1.5;
    // var finalLandingTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    // var finalLandingCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), parseFloat(destNodeObj.alt));
    // propertyPosition.addSample(finalLandingTime, finalLandingCartesian);
    // propertyOrientation.addSample(finalLandingTime, Cesium.Transforms.headingPitchRollQuaternion(finalLandingCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));


    // 두 지점 간 진행 방위각(Radian) 실시간 산출 헬퍼 함수
    var calcSegmentHeading = function (fromNode, toNode, altVal) {
        var p1 = Cesium.Cartesian3.fromDegrees(parseFloat(fromNode.lon), parseFloat(fromNode.lat), altVal);
        var p2 = Cesium.Cartesian3.fromDegrees(parseFloat(toNode.lon), parseFloat(toNode.lat), altVal);
        try {
            var invMat = Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(p1), new Cesium.Matrix4());
            if (Cesium.defined(invMat)) {
                var localVec = Cesium.Matrix4.multiplyByPoint(invMat, p2, new Cesium.Cartesian3());
                var h = Math.atan2(localVec.x, localVec.y);
                if (!isNaN(h) && isFinite(h)) return h;
            }
        } catch (e) { }
        return 0.0;
    };

    // 실제 비행에 사용할 중간 경유지 필터링 (목적지와 좌표가 같은 가드 WP 제외)
    var validWaypoints = flightPathPoints.filter(function (node) {
        if (!node || isNaN(parseFloat(node.lon)) || isNaN(parseFloat(node.lat))) return false;
        var isSameAsDest = (Math.abs(parseFloat(node.lon) - parseFloat(destNodeObj.lon)) < 0.00001 &&
            Math.abs(parseFloat(node.lat) - parseFloat(destNodeObj.lat)) < 0.00001);
        return !isSameAsDest;
    });

    var currentLegHeading = targetHeadingRadian; // 현재 구간 진입 방위각 추적 변수

    // 1. 경유지(WP) 순회: 진입 각도로 도착 -> 1.5초 호버링하며 다음 목표 방향으로 기수 회전
    for (var j = 0; j < validWaypoints.length; j++) {
        var node = validWaypoints[j];
        var nextNodeAfterWp = (j + 1 < validWaypoints.length) ? validWaypoints[j + 1] : destNodeObj;
        var targetNodeAlt = parseFloat(node.alt) || actualHomeFlightAlt;
        var exactWpCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(node.lon), parseFloat(node.lat), targetNodeAlt);

        // [A] 경유지 도착 (이전 구간 진행 방향 그대로 진입)
        timeSum += 4.0;
        var nodeTimeArrival = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        propertyPosition.addSample(nodeTimeArrival, exactWpCartesian);
        propertyOrientation.addSample(nodeTimeArrival, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(currentLegHeading, 0.0, 0.0)));

        // [B] 경유지 호버링 (1.5초간 제자리 정지하면서 다음 목표 방향으로 기수 회전)
        var nextLegHeading = calcSegmentHeading(node, nextNodeAfterWp, targetNodeAlt);
        var startWpHoverTime = timeSum;
        timeSum += 1.5;
        var nodeTimeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        propertyPosition.addSample(nodeTimeHoverEnd, exactWpCartesian);
        propertyOrientation.addSample(nodeTimeHoverEnd, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(nextLegHeading, 0.0, 0.0)));

        window.gcsHoverScheduleTimestamps.push({ name: node.id, start: startWpHoverTime, end: timeSum });
        currentLegHeading = nextLegHeading; // 다음 구간 진행 방향 갱신
    }

    // 목적지 카드에 저장된 설정 방향각(heading_H) 추출
    var destTargetHeadingRad = currentLegHeading;
    if (destNodeObj) {
        if (destNodeObj.heading_H !== undefined && !isNaN(parseFloat(destNodeObj.heading_H))) {
            destTargetHeadingRad = parseFloat(destNodeObj.heading_H);
        } else if (destNodeObj.heading_deg !== undefined && !isNaN(parseFloat(destNodeObj.heading_deg))) {
            destTargetHeadingRad = Cesium.Math.toRadians(parseFloat(destNodeObj.heading_deg));
        }
    }

    // 2. 목적지 직상공 천장 진입 (마지막 구간 진행 방향 그대로 도착)
    timeSum += 4.0;
    var destTopAirspaceTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    var lastWpNode = validWaypoints.length > 0 ? validWaypoints[validWaypoints.length - 1] : homeNode;
    var calculatedTopAlt = parseFloat(lastWpNode.alt) || actualHomeFlightAlt;
    var destTopAirspaceCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), calculatedTopAlt);

    propertyPosition.addSample(destTopAirspaceTime, destTopAirspaceCartesian);
    propertyOrientation.addSample(destTopAirspaceTime, Cesium.Transforms.headingPitchRollQuaternion(destTopAirspaceCartesian, new Cesium.HeadingPitchRoll(currentLegHeading, 0.0, 0.0)));

    // 3. 목적지 상공 호버링 (3.5초간 정지 비행하면서 목적지 설정 방향각으로 기수 회전 완료)
    var destTopHoverStart = timeSum;
    timeSum += 3.5;
    var destTopHoverEndTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());

    // [중요] 호버링이 끝나는 시점에 이미 destTargetHeadingRad로 회전이 100% 완료됨
    var finalFixedOrientation = Cesium.Transforms.headingPitchRollQuaternion(
        destTopAirspaceCartesian,
        new Cesium.HeadingPitchRoll(destTargetHeadingRad, 0.0, 0.0)
    );
    propertyPosition.addSample(destTopHoverEndTime, destTopAirspaceCartesian);
    propertyOrientation.addSample(destTopHoverEndTime, finalFixedOrientation);
    window.gcsHoverScheduleTimestamps.push({ name: "Dest_Top_Hover", start: destTopHoverStart, end: timeSum });

    // 4. 최종 목적지 수직 하강 착륙 (회전 없이 상공에서 맞춘 방향각 그대로 수직 하강)
    timeSum += 1.5;
    var finalLandingTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    var finalLandingCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), parseFloat(destNodeObj.alt));
    var landingFixedOrientation = Cesium.Transforms.headingPitchRollQuaternion(
        finalLandingCartesian,
        new Cesium.HeadingPitchRoll(destTargetHeadingRad, 0.0, 0.0)
    );

    propertyPosition.addSample(finalLandingTime, finalLandingCartesian);
    propertyOrientation.addSample(finalLandingTime, landingFixedOrientation);

    // 5. 착륙 완료 후 2.5초간 기체는 착륙 지점에 정지 유지 (동일 방향각 완벽 고정)
    var landingCompleteTimeRef = timeSum;
    timeSum += 2.5;
    var finalPovEndTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(finalPovEndTime, finalLandingCartesian);
    propertyOrientation.addSample(finalPovEndTime, landingFixedOrientation);



    window.gcsLiveLandingTimeRef = landingCompleteTimeRef;
    window.gcsLiveTimeSumRef = timeSum;


    // 목적지 카드에 저장된 설정 방향각(heading_H) 추출 (착륙 시 드론 기수 회전용)
    var destTargetHeadingRad = targetHeadingRadian;
    if (destNodeObj) {
        if (destNodeObj.heading_H !== undefined && !isNaN(parseFloat(destNodeObj.heading_H))) {
            destTargetHeadingRad = parseFloat(destNodeObj.heading_H);
        } else if (destNodeObj.heading_deg !== undefined && !isNaN(parseFloat(destNodeObj.heading_deg))) {
            destTargetHeadingRad = Cesium.Math.toRadians(parseFloat(destNodeObj.heading_deg));
        }
    }

    // 최종 목적지(원래 설정된 착륙 고도)로 수직 하강 착륙 (목적지 설정 방향각으로 기수 정렬)
    timeSum += 1.5;
    var finalLandingTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    var finalLandingCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), parseFloat(destNodeObj.alt));
    propertyPosition.addSample(finalLandingTime, finalLandingCartesian);
    propertyOrientation.addSample(finalLandingTime, Cesium.Transforms.headingPitchRollQuaternion(finalLandingCartesian, new Cesium.HeadingPitchRoll(destTargetHeadingRad, 0.0, 0.0)));

    // 착륙 완료 후 2.5초간 기체는 착륙 지점에 정지 유지
    var landingCompleteTimeRef = timeSum;
    timeSum += 2.5;
    var finalPovEndTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(finalPovEndTime, finalLandingCartesian);
    propertyOrientation.addSample(finalPovEndTime, Cesium.Transforms.headingPitchRollQuaternion(finalLandingCartesian, new Cesium.HeadingPitchRoll(destTargetHeadingRad, 0.0, 0.0)));

    window.gcsLiveLandingTimeRef = landingCompleteTimeRef;
    window.gcsLiveTimeSumRef = timeSum;
    window.gcsSimulatedDroneEntity = mainViewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: finalPovEndTime })]),
        position: propertyPosition,
        orientation: propertyOrientation,
        model: { uri: "data/drone.glb", scale: 0.15, minimumPixelSize: 35, maximumScale: 50, runAnimations: true },
        label: { text: "UAV 자율 항행 시동", font: 'bold 14px "Malgun Gothic", sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE, fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.CENTER, horizontalOrigin: Cesium.HorizontalOrigin.LEFT, pixelOffset: new Cesium.Cartesian2(40, 10), disableDepthTestDistance: Number.POSITIVE_INFINITY }
    });

    // =========================================================================
    // 🧭 [추가] 드론 기체 전방 실시간 기수 방향 화살표 (호버링 회전 & 목적지 방향 표시)
    // =========================================================================
    var oldHeadingArrow = mainViewer.entities.getById("GCS_DRONE_LIVE_HEADING_ARROW");
    if (oldHeadingArrow) mainViewer.entities.remove(oldHeadingArrow);

    mainViewer.entities.add({
        id: "GCS_DRONE_LIVE_HEADING_ARROW",
        polyline: {
            positions: new Cesium.CallbackProperty(function (time) {
                if (!window.gcsSimulatedDroneEntity) return [];
                var pos = window.gcsSimulatedDroneEntity.position.getValue(time);
                var ori = window.gcsSimulatedDroneEntity.orientation.getValue(time);
                if (!Cesium.defined(pos) || !Cesium.defined(ori)) return [];

                // 드론의 현재 자세(Quaternion)에서 기수 전방(Local X축 또는 Y축) 방향 벡터 산출
                var rotMatrix = Cesium.Matrix3.fromQuaternion(ori, new Cesium.Matrix3());
                // Cesium headingPitchRollQuaternion 기준 heading=0(정북)일 때 전방은 Local Y축 (컬럼 1)
                var forwardDir = Cesium.Matrix3.getColumn(rotMatrix, 1, new Cesium.Cartesian3());
                var arrowEndPos = Cesium.Cartesian3.add(
                    pos,
                    Cesium.Cartesian3.multiplyByScalar(forwardDir, 25.0, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                );
                return [pos, arrowEndPos];
            }, false),
            width: 10.0,
            material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.YELLOW),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    mainViewer.clock.startTime = startTime.clone();
    mainViewer.clock.stopTime = finalPovEndTime.clone();
    mainViewer.clock.currentTime = startTime.clone();
    mainViewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
    mainViewer.clock.multiplier = 1.0;
    mainViewer.clock.shouldAnimate = true;
    window.gcsLiveEndTimeRef = finalPovEndTime;


    var cameraStaticFixedPosition = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeBaseH + 260.0);
    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    mainViewer.camera.setView({ destination: cameraStaticFixedPosition, orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 } });
    var gcsStopwatchStartTime = performance.now();
    if (window.gcsStopwatchIntervalId) clearInterval(window.gcsStopwatchIntervalId);

    window.gcsStopwatchIntervalId = setInterval(function () {
        var timeElement = document.getElementById("gcs_stopwatch_time_core");
        if (timeElement) {
            var elapsed = (performance.now() - gcsStopwatchStartTime) / 1000;
            timeElement.textContent = elapsed.toFixed(2);
        }
    }, 10);

    if (typeof window.switchGcsMainWindowAndHud === "function") window.switchGcsMainWindowAndHud(window.isGcsLayoutSwapped);
    mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener);
    mainViewer.scene.postRender.addEventListener(window.gcsMultiCamRenderListener);
    scene.requestRender();
};


// =========================================================================
// 🛰️ [목적지 도착 시 사선 화각 유지 및 광역 정면 줌아웃(Zoom-out) 동행 하강 관제 엔진]
// =========================================================================
window.gcsMultiCamRenderListener = function () {
    if (!window.gcsSimulatedDroneEntity) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;
    var currentTime = mainViewer.clock.currentTime;
    if (!window.gcsLiveStartTimeRef) return;

    var elapsed = Cesium.JulianDate.secondsDifference(currentTime, window.gcsLiveStartTimeRef);
    var stage = "cruise", statusStr = "임무 공역 자율 순항", labelColor = Cesium.Color.CYAN;

    var currentHudContainer = document.getElementById("gcs_internal_hud_container") || document.querySelector('.gcs-hud-panel') || document.getElementById("hud");
    var elStatus = document.getElementById("hud_status_text"), elStage = document.getElementById("hud_metric_stage"), elAlt = document.getElementById("hud_metric_alt"), elHeading = document.getElementById("hud_metric_heading"), elCoords = document.getElementById("hud_metric_coords");

    var droneCartesian = window.gcsSimulatedDroneEntity.position.getValue(currentTime);
    if (!Cesium.defined(droneCartesian)) return;
    var droneCarto = Cesium.Cartographic.fromCartesian(droneCartesian);
    if (!Cesium.defined(droneCarto)) return;

    var lon = Cesium.Math.toDegrees(droneCarto.longitude), lat = Cesium.Math.toDegrees(droneCarto.latitude), alt = droneCarto.height;
    if (isNaN(lon) || isNaN(lat) || isNaN(alt) || lon === 0 || lat === 0) return;

    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    if (!Array.isArray(list) || list.length < 2) return;
    var destNode = list[list.length - 1];


    // 임무 최종 터치다운 안착 세션 완료 -> 목적지 설정 방위각 및 화면 정중앙 0° POV 고정
    if (elapsed >= (window.gcsLiveTimeSumRef - 0.05) || (window.gcsDroneLiveState && window.gcsDroneLiveState.currentStageString === "landing_done")) {
        mainViewer.clock.shouldAnimate = false;
        mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener);
        window.gcsCameraTrackingModeActive = false;

        if (window.gcsDroneLiveState) {
            window.gcsDroneLiveState.currentStageString = "landing_done";
            window.gcsDroneLiveState.isTakeoffConfirmedGuard = false; // ◀ [추가] 비행 보호 잠금 해제
        }

        if (window.gcsStopwatchIntervalId) {
            clearInterval(window.gcsStopwatchIntervalId);
            window.gcsStopwatchIntervalId = null;
        }

        var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : (window.waypointList || []);
        var destNode = list.find(function (n) { return n && n.id === "Destination"; });

        if (destNode) {
            var finalLon = parseFloat(destNode.lon);
            var finalLat = parseFloat(destNode.lat);
            var finalAlt = parseFloat(destNode.alt) || 150.0;

            // 목적지 카드에 저장된 방위각을 우선 적용 (설정 당시 뷰 방향과 100% 일치)
            var finalHeading = window.gcsSmoothCameraHeading || window.gcsLiveHeadingRef || 0.0;
            if (destNode.heading_H !== undefined && !isNaN(parseFloat(destNode.heading_H))) {
                finalHeading = parseFloat(destNode.heading_H);
            } else if (destNode.heading_deg !== undefined && !isNaN(parseFloat(destNode.heading_deg))) {
                finalHeading = Cesium.Math.toRadians(parseFloat(destNode.heading_deg));
            }

            // 드론 모델 중심 높이(finalAlt + 1.5m)에서 뒤로 22.0m 줌아웃 배치
            var lookDist = 22.0; // 기존 8.0 -> 22.0으로 수정
            var metersPerDegLat = 111320.0;
            var metersPerDegLon = 111320.0 * Math.cos(Cesium.Math.toRadians(finalLat));
            var offsetLat = (lookDist * Math.cos(finalHeading)) / metersPerDegLat;
            var offsetLon = (lookDist * Math.sin(finalHeading)) / metersPerDegLon;

            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(finalLon - offsetLon, finalLat - offsetLat, finalAlt + 1.5),
                orientation: {
                    heading: finalHeading,
                    pitch: Cesium.Math.toRadians(0.0),
                    roll: 0.0
                }
            });
        }

        var statusEl = document.getElementById("hud_status_text") || document.getElementById("gcs_sim_status");
        if (statusEl) statusEl.textContent = "임무 완료 (착륙 및 0° POV 정합)";

        mainViewer.scene.requestRender();
        return;
    }



    var t_wait = 1.0;
    var isActuallyClimbedUp = (alt >= (window.gcsLiveCurrentCruiseAltRef * 0.95));
    var homeHoverEndLimit = 5.5;

    // 항행 타임라인 세션 정밀 매핑
    if (elapsed <= t_wait) {
        stage = "takeoff_ready"; statusStr = "지면 모터 시동 대기"; labelColor = Cesium.Color.LIGHTGRAY;
    } else if (elapsed > t_wait && !isActuallyClimbedUp && elapsed < homeHoverEndLimit) {
        stage = "takeoff_climb"; statusStr = "이륙 및 수직 상승 기동"; labelColor = Cesium.Color.ORANGE;
    } else if (elapsed > t_wait && elapsed <= homeHoverEndLimit) {
        stage = "takeoff_hover"; statusStr = "이륙고도 안착 경로회전 정렬"; labelColor = Cesium.Color.YELLOW;
    } else if (elapsed > (window.gcsLiveTimeSumRef - 5.0) && elapsed <= (window.gcsLiveTimeSumRef - 1.5)) {
        // 🔒 드론은 목적지 최고 상공 기둥 천장에서 3.5초간 완벽 정지 비행(호버링) 수행
        stage = "dest_top_hover"; statusStr = "목적지 상공 정지 호버링 및 광역 줌아웃"; labelColor = Cesium.Color.YELLOW;
    } else if (elapsed > (window.gcsLiveTimeSumRef - 1.5)) {
        // 🔒 시점이 정면 광역 POV축과 안전 결착된 후 비로소 수직 하강 순항 시작
        stage = "descending_land"; statusStr = "목적지 구조물 정밀 사선 POV 동행 하강"; labelColor = Cesium.Color.DEEPPINK;
    } else {
        stage = "cruise"; statusStr = "임무 공역 자율 순항"; labelColor = Cesium.Color.CYAN;
        if (window.gcsHoverScheduleTimestamps && window.gcsHoverScheduleTimestamps.length > 1) {
            for (var k = 1; k < window.gcsHoverScheduleTimestamps.length; k++) {
                var sch = window.gcsHoverScheduleTimestamps[k];
                if (sch && elapsed >= sch.start && elapsed <= sch.end) {
                    statusStr = "지정 노드 호버링 관제";
                    labelColor = Cesium.Color.YELLOW;
                    break;
                }
            }
        }
    }

    if (window.gcsDroneLiveState) window.gcsDroneLiveState.currentStageString = stage;
    if (window.gcsSimulatedDroneEntity && window.gcsSimulatedDroneEntity.label) {
        window.gcsSimulatedDroneEntity.label.text = "🛸 " + statusStr + " (" + Math.round(alt) + "m)";
        window.gcsSimulatedDroneEntity.label.fillColor = labelColor;
    }

    var finalCameraHeading = window.gcsLiveHeadingRef;


    // =========================================================================
    // 🔒 [GCS 코어 관제 엔진] 호버링 줌아웃 -> 자율 순항 무결점 연속 전환 코드
    // =========================================================================
    if (window.gcsCameraTrackingModeActive) {
        mainViewer.trackedEntity = undefined;

        var safe_t_wait = 1.0;
        var safe_t_climb = 5.0;
        var safe_t_hover = 4.5;
        var climbEndTime = safe_t_wait + safe_t_climb;          // 6.0초
        var cruiseStartTime = climbEndTime + safe_t_hover;      // 10.5초

        // var cruiseEndTime = window.gcsLiveTimeSumRef - 5.0;
        // 💥 [수정] 착륙 후 POV 전환(2.5초)이 추가되었으므로 cruiseEndTime을 -7.5초로 조정
        var cruiseEndTime = window.gcsLiveTimeSumRef - 7.5;
        var landingEndTime = window.gcsLiveTimeSumRef - 2.5;

        // 1. 다음 목표 지점 방위각 계산
        var targetHeadingRadian = window.gcsLiveHeadingRef || 0.0;
        var currentWpIndex = -1;

        if (window.gcsHoverScheduleTimestamps && window.gcsHoverScheduleTimestamps.length > 0) {
            currentWpIndex = window.gcsHoverScheduleTimestamps.findIndex(function (ts) {
                return elapsed >= ts.start && elapsed <= ts.end;
            });
        }

        var nextTargetNode = destNode;
        var flightPathPoints = list.filter(function (n) { return n && n.id !== "Home" && n.id !== "Destination"; });

        if (elapsed <= cruiseStartTime) {
            nextTargetNode = (flightPathPoints.length > 0) ? flightPathPoints : destNode;
        } else if (currentWpIndex !== -1) {
            nextTargetNode = (currentWpIndex < flightPathPoints.length) ? flightPathPoints[currentWpIndex] : destNode;
        } else if (flightPathPoints.length > 0) {
            for (var k = 0; k < flightPathPoints.length; k++) {
                var nodeSch = window.gcsHoverScheduleTimestamps[k + 1];
                if (nodeSch && elapsed < nodeSch.start) {
                    nextTargetNode = flightPathPoints[k];
                    break;
                }
            }
        }

        if (nextTargetNode) {
            var currentDronePos = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
            var targetNodePos = Cesium.Cartesian3.fromDegrees(parseFloat(nextTargetNode.lon), parseFloat(nextTargetNode.lat), alt);
            try {
                var localMatrix = Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(currentDronePos), new Cesium.Matrix4());
                if (Cesium.defined(localMatrix)) {
                    var localVector = Cesium.Matrix4.multiplyByPoint(localMatrix, targetNodePos, new Cesium.Cartesian3());
                    var dynamicCalcHeading = Math.atan2(localVector.x, localVector.y);
                    if (!isNaN(dynamicCalcHeading) && isFinite(dynamicCalcHeading)) {
                        targetHeadingRadian = dynamicCalcHeading;
                    }
                }
            } catch (err) { }
        }

        if (typeof window.gcsSmoothCameraHeading === "undefined" || elapsed <= climbEndTime) {
            window.gcsSmoothCameraHeading = targetHeadingRadian;
        }


        // 2. 경과 시간(elapsed) 기준 연속 보간 (목적지 상공 즉시 줌인 + 방향각 동시 회전)
        var targetPitchDeg = -45.0;
        var currentAltOffset = 110.0;
        var targetHeadingRad = targetHeadingRadian;

        if (elapsed <= climbEndTime) {
            // [1단계: 이륙 및 수직 상승] -90도 탑뷰, 고도 마진 60m 고정
            targetPitchDeg = -90.0;
            currentAltOffset = 60.0;
            targetHeadingRad = targetHeadingRadian;
            window.gcsHoverStartHeading = undefined; // 초기화

        } else if (elapsed > climbEndTime && elapsed <= cruiseStartTime) {
            // [2단계: 출발지 상공 호버링 줌아웃] 4.5초 동안 부드럽게 틸트 및 줌아웃
            var hoverProgress = (elapsed - climbEndTime) / safe_t_hover;
            hoverProgress = Math.min(1.0, Math.max(0.0, hoverProgress));
            var smooth = hoverProgress * hoverProgress * (3.0 - 2.0 * hoverProgress);

            targetPitchDeg = -90.0 + (smooth * 45.0);      // -90° -> -45°
            currentAltOffset = 60.0 + (smooth * 50.0);     // 60m -> 110m 줌아웃
            targetHeadingRad = targetHeadingRadian;

        } else if (elapsed > cruiseStartTime && elapsed <= cruiseEndTime) {
            // [3단계: 임무 공역 자율 순항] 목적지 상공 도착 직전까지 110m 고도 및 -45° 화각 일관 유지
            targetPitchDeg = -45.0;
            currentAltOffset = 110.0;
            targetHeadingRad = targetHeadingRadian;
            window.gcsHoverStartHeading = undefined; // 호버링 시작 각도 캡처 대기


        } else if (elapsed > cruiseEndTime && elapsed <= (landingEndTime - 1.5)) {
            // [4단계: 목적지 상공 도착 즉시 지연 없이 줌인 + 목적지 방향각 동시 회전 (3.5초)]
            var destHoverProgress = (elapsed - cruiseEndTime) / 3.5;
            destHoverProgress = Math.min(1.0, Math.max(0.0, destHoverProgress));

            // 도착 직후 바로 줌인이 체감되도록 Ease-Out 곡선 적용
            var smoothDest = 1.0 - Math.pow(1.0 - destHoverProgress, 2.5);

            if (window.gcsHoverStartHeading === undefined) {
                window.gcsHoverStartHeading = window.gcsSmoothCameraHeading;
            }

            var savedDestHeadingRad = window.gcsHoverStartHeading;
            if (destNode) {
                if (destNode.heading_H !== undefined && !isNaN(parseFloat(destNode.heading_H))) {
                    savedDestHeadingRad = parseFloat(destNode.heading_H);
                } else if (destNode.heading_deg !== undefined && !isNaN(parseFloat(destNode.heading_deg))) {
                    savedDestHeadingRad = Cesium.Math.toRadians(parseFloat(destNode.heading_deg));
                }
            }

            var hoverAngleDiff = savedDestHeadingRad - window.gcsHoverStartHeading;
            while (hoverAngleDiff < -Math.PI) hoverAngleDiff += Math.PI * 2;
            while (hoverAngleDiff > Math.PI) hoverAngleDiff -= Math.PI * 2;

            window.gcsSmoothCameraHeading = window.gcsHoverStartHeading + (hoverAngleDiff * smoothDest);
            targetHeadingRad = window.gcsSmoothCameraHeading;

            // 대기 시간 없이 즉시 110m -> 18m 줌인 및 -45° -> -90° 탑뷰 전환
            currentAltOffset = 110.0 - (smoothDest * 92.0);
            targetPitchDeg = -45.0 - (smoothDest * 45.0);


        } else if (elapsed > (landingEndTime - 1.5) && elapsed <= landingEndTime) {
            // [5단계: 최종 착륙 하강 (1.5초)] 정렬 완료된 목적지 방향각 그대로 수직 하강
            targetPitchDeg = -90.0;
            currentAltOffset = 18.0;
            targetHeadingRad = window.gcsSmoothCameraHeading;

        } else {
            // [6단계: 착륙 완료 후 수평 POV 전환 (2.5초)] 좌우 회전 없이 고개만 -90° -> 0°로 들어 올림
            var povProgress = (elapsed - landingEndTime) / 2.5;
            povProgress = Math.min(1.0, Math.max(0.0, povProgress));
            var smoothPov = povProgress * povProgress * (3.0 - 2.0 * povProgress);

            targetPitchDeg = -90.0 + (smoothPov * 90.0);
            currentAltOffset = 18.0 - (smoothPov * 16.5);
            targetHeadingRad = window.gcsSmoothCameraHeading;
        }

        // 3. 각도 보간 (4단계 이후에는 이미 정밀 보간되었으므로 1~3단계 순항 중에만 감쇠 적용)
        if (elapsed <= cruiseEndTime) {
            var angleDiff = targetHeadingRad - window.gcsSmoothCameraHeading;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            window.gcsSmoothCameraHeading += angleDiff * 0.08;
        }

        finalCameraHeading = window.gcsSmoothCameraHeading;
        dynamicPitchDegree = targetPitchDeg;


        // 4. 위도 보정(cosLat)이 적용된 정밀 3D 후방 오프셋 계산
        var lookDistanceMeters = 0.0;
        var pitchAbs = Math.abs(dynamicPitchDegree);

        if (elapsed > landingEndTime) {
            // [6단계 전용] 후방 거리를 0m에서 22.0m까지 부드럽게 줌아웃
            var povRatio = Math.min(1.0, Math.max(0.0, (elapsed - landingEndTime) / 2.5));
            var smoothPovRatio = povRatio * povRatio * (3.0 - 2.0 * povRatio);
            lookDistanceMeters = smoothPovRatio * 22.0; // 기존 8.0 -> 22.0으로 수정
        } else if (pitchAbs < 89.0) {
            var tanVal = Math.tan(Cesium.Math.toRadians(Math.max(15.0, pitchAbs)));
            lookDistanceMeters = currentAltOffset / tanVal;
        }

        var metersPerDegLat = 111320.0;
        var metersPerDegLon = 111320.0 * Math.cos(Cesium.Math.toRadians(lat));

        var offsetLat = (lookDistanceMeters * Math.cos(finalCameraHeading)) / metersPerDegLat;
        var offsetLon = (lookDistanceMeters * Math.sin(finalCameraHeading)) / metersPerDegLon;

        targetCamLon = lon - offsetLon;
        targetCamLat = lat - offsetLat;
        targetCamAlt = alt + currentAltOffset;

        mainViewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(targetCamLon, targetCamLat, targetCamAlt),
            orientation: {
                heading: finalCameraHeading,
                pitch: Cesium.Math.toRadians(dynamicPitchDegree),
                roll: 0.0
            }
        });


    }


    var liveHeadingDegree = (finalCameraHeading * (180 / Math.PI));
    if (isNaN(liveHeadingDegree) || !isFinite(liveHeadingDegree)) liveHeadingDegree = 0.0;
    if (liveHeadingDegree < 0) liveHeadingDegree += 360.0;
    if (currentHudContainer && currentHudContainer.style.display === "block") {
        if (elStatus) elStatus.innerText = statusStr;
        if (elStage) elStage.innerText = (stage.indexOf("takeoff_ready") !== -1 || stage.indexOf("takeoff_climb") !== -1 ? "🛫 이륙 및 고도 상승 고정" : (stage.indexOf("descending_land") !== -1 ? "🛬 목적지 정밀 착륙 하강" : "🛸 임무 공역 자율 순항"));
        if (elAlt) elAlt.innerText = Math.round(alt);
        if (elHeading) elHeading.innerText = liveHeadingDegree.toFixed(1);
        if (elCoords) elCoords.innerText = "X: " + lon.toFixed(5) + ", Y: " + lat.toFixed(5);
    }
    var canvas = document.getElementById("gcs_hud_minimap_canvas");
    if (canvas && window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
        try { window.GcsThreeRadar.update([], lon, lat, alt); } catch (e) { }
    }
};


// =========================================================================
// 🛸 [GCS 코어 그래픽 엔진 - 공역 파이프라인 및 홈 삼각기둥 최종 사출기]
// =========================================================================
window.rebuildGcsPipelineAndLabels = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    // [수정] 실제로 드론이 비행 중일 때만 렌더링을 차단하고, 착륙 완료(landing_done) 시에는 허용
    if (window.gcsDroneLiveState && window.gcsDroneLiveState.isTakeoffConfirmedGuard === true) {
        if (window.gcsDroneLiveState.currentStageString !== "landing_done") {
            return;
        }
    }

    var fireZoneEntities = window.GcsApp.state.gcsFireZoneEntities || window.gcsFireZoneEntities || [];
    fireZoneEntities.forEach(function (e) { if (e && mainViewer.entities.contains(e)) mainViewer.entities.remove(e); });

    window.GcsApp.state.gcsFireZoneEntities = [];
    var pipeLinePositions = [];
    var list = window.GcsApp.state.waypointList || window.waypointList || [];
    if (!Array.isArray(list) || list.length === 0) return;
    list.forEach(function (node) {
        if (!node || !node.id) return;
        if (String(node.id).toLowerCase() === "home") {
            node.id = "Home";
        }
        var nodeLon = parseFloat(node.lon);
        var nodeLat = parseFloat(node.lat);
        var nodeAlt = parseFloat(node.alt);
        var buildingBaseHeight = Math.round(parseFloat(node.roofBase) || 86);
        var absoluteTopCenter = Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt);
        pipeLinePositions.push(absoluteTopCenter);
        var nodeColor = (node.id === "Home") ? Cesium.Color.DARKORANGE : ((node.id === "Destination") ? Cesium.Color.RED : Cesium.Color.CYAN);
        if (node.id === "Home") {
            var explicitIds = ["GCS_HPAD_CORE", "GCS_HPAD_PIN"];
            explicitIds.forEach(function (id) { var ent = mainViewer.entities.getById(id); if (ent) mainViewer.entities.remove(ent); });
            var positions = [];
            for (var i = 0; i <= 360; i += 5) {
                var radians = Cesium.Math.toRadians(i);
                positions.push(Cesium.Cartesian3.fromDegrees(nodeLon + (0.00012 * Math.cos(radians)), nodeLat + (0.00012 * Math.sin(radians)), buildingBaseHeight + 0.3));
            }
            window.GcsApp.state.gcsFireZoneEntities.push(
                mainViewer.entities.add({ id: "GCS_HPAD_CORE", polyline: { positions: positions, width: 6.0, material: Cesium.Color.YELLOW, disableDepthTestDistance: Number.POSITIVE_INFINITY } }),
                mainViewer.entities.add({ id: "GCS_HPAD_PIN", position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, buildingBaseHeight + 0.5), point: { pixelSize: 18, color: Cesium.Color.DEEPPINK, outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
            );
        }


        // =========================================================================
        // 🔺 [개선] 삼각기둥의 뾰족한 앞코(꼭짓점)가 목표 기수 방향(heading_deg)을 가리키도록 회전 생성
        // =========================================================================
        var nodeHeadingDeg = (node.heading_deg !== undefined && !isNaN(parseFloat(node.heading_deg)))
            ? parseFloat(node.heading_deg)
            : 0;
        var headRad = Cesium.Math.toRadians(nodeHeadingDeg);
        var metersPerDegLat = 111320.0;
        var metersPerDegLon = 111320.0 * Math.cos(Cesium.Math.toRadians(nodeLat));

        // 1번 꼭짓점(앞코): 설정된 기수 방향으로 6.5m 뻗어나감
        // 2, 3번 꼭짓점(좌·우 뒷날개): 앞코 기준 ±135° 방향으로 4.5m 배치 (방향 식별이 쉬운 화살촉형 삼각형)
        var vertexOffsets = [
            { angleRad: headRad, distMeters: 6.5 },                          // [0] 뾰족한 기수 앞코
            { angleRad: headRad + Cesium.Math.toRadians(135), distMeters: 4.5 }, // [1] 우측 후미 꼭짓점
            { angleRad: headRad - Cesium.Math.toRadians(135), distMeters: 4.5 }  // [2] 좌측 후미 꼭짓점
        ];

        var basePoints = vertexOffsets.map(function (v) {
            return {
                lon: nodeLon + (v.distMeters * Math.sin(v.angleRad)) / metersPerDegLon,
                lat: nodeLat + (v.distMeters * Math.cos(v.angleRad)) / metersPerDegLat
            };
        });

        var trianglePosArray = [];
        basePoints.forEach(function (pt) { trianglePosArray.push(pt.lon, pt.lat); });

        // =========================================================================
        // 🎯 [표기] 삼각기둥 윗면의 뾰족한 앞코 꼭짓점(basePoints[0])에 방향 식별 마커 표기
        // =========================================================================
        if (node.id === "Destination" || node.id === "Home") {
            var nosePoint = basePoints[0]; // 윗면 삼각형의 기수 방향 끝점
            var noseColor = (node.id === "Destination") ? Cesium.Color.YELLOW : Cesium.Color.CYAN;

            window.GcsApp.state.gcsFireZoneEntities.push(
                // 윗면 꼭짓점 끝단 방향 표기 포인트
                mainViewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(nosePoint.lon, nosePoint.lat, nodeAlt + 0.3),
                    point: {
                        pixelSize: 12,
                        color: noseColor,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    }
                }),
                // 삼각기둥 윗면 중심에서 뾰족한 꼭짓점 끝단까지 이어지는 중심 방향선
                mainViewer.entities.add({
                    polyline: {
                        positions: [
                            Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt + 0.3),
                            Cesium.Cartesian3.fromDegrees(nosePoint.lon, nosePoint.lat, nodeAlt + 0.3)
                        ],
                        width: 4.0,
                        material: noseColor,
                        arcType: Cesium.ArcType.NONE,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    }
                })
            );
        }

        basePoints.forEach(function (pt, idx) {
            var nextPt = basePoints[(idx + 1) % basePoints.length];
            window.GcsApp.state.gcsFireZoneEntities.push(
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)], width: 4.5, material: Cesium.Color.fromAlpha(nodeColor, 0.95), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } }),
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)], width: 4.5, material: Cesium.Color.fromAlpha(nodeColor, 0.95), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } }),
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)], width: 3.0, material: Cesium.Color.fromAlpha(nodeColor, 0.7), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
            );
        });

        // =========================================================================
        // 🏢 [개선] 목적지(Destination) 및 건물은 지표면 대비 높이(3m=1층)를 환산하여 '몇m (N층)' 표기
        // =========================================================================
        var groundHeight = scene.globe
            ? (scene.globe.getHeight(Cesium.Cartographic.fromDegrees(nodeLon, nodeLat)) || 86)
            : 86;
        var isAptOrBuilding = (node.isBuilding === true ||
            (node.address && (node.address.indexOf("건물") !== -1 || node.address.indexOf("옥상") !== -1 || node.address.indexOf("아파트") !== -1)));

        var labelDisplayText = node.id + " (" + Math.round(nodeAlt) + "m)";
        if (node.id === "Destination" || isAptOrBuilding) {
            var heightFromGround = Math.max(0, nodeAlt - groundHeight);
            var estimatedFloor = Math.max(1, Math.round(heightFromGround / 3.0)); // 아파트 표준 층고 3m 기준
            labelDisplayText = node.id + " " + Math.round(nodeAlt) + "m (" + estimatedFloor + "층)";
        }

        window.GcsApp.state.gcsFireZoneEntities.push(
            mainViewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt + 12.0),
                label: {
                    text: labelDisplayText,
                    font: 'bold 14px "Malgun Gothic", sans-serif',
                    fillColor: nodeColor,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            })
        );

    });



    if (pipeLinePositions.length > 1) {
        window.GcsApp.state.gcsFireZoneEntities.push(
            mainViewer.entities.add({ polyline: { positions: pipeLinePositions, width: 5, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
        );
    }
    scene.requestRender();
};


// =========================================================================
// 🛸 [통합 리렌더러] 저장 버튼 + 화면 12시 방위각 반영 + 2D/3D 정중앙 이동
// =========================================================================
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
    var mainViewer = (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) ? ws3d.viewer : null;

    // 진북(0°) 시계방향 방위각 변환 유틸리티
    var calcTrueNorthBearing = function (deg) {
        var cwDeg = Math.round(deg) % 360;
        if (cwDeg < 0) cwDeg += 360;
        var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
        var compassCode = directions[Math.round(cwDeg / 45)];
        return { code: compassCode, deg: cwDeg, rad: Cesium.Math.toRadians(cwDeg), text: compassCode + " " + cwDeg + ".0°" };
    };

    list.forEach(function (wp) {
        if (!wp || !wp.id) return;
        if (String(wp.id).toLowerCase() === "home") wp.id = "Home";

        var numLon = parseFloat(wp.lon);
        var numLat = parseFloat(wp.lat);
        var finalCalculatedHeight = Math.round(parseFloat(wp.roofBase) || 0);
        var isBuildingNode = (wp.isBuilding === true || (wp.address && wp.address.indexOf("건물") !== -1) || (wp.address && wp.address.indexOf("옥상") !== -1));
        var heightLabelText = isBuildingNode ? "건물고도" : "지면고도";
        var labelStyleColor = isBuildingNode ? "#fffa65" : "#00ffcc";
        var absoluteControlAlt = Math.round(parseFloat(wp.alt));

        // 1. 기체기수 방위각 박스 생성 (지점 간 각도가 아닌 카메라 12시 방향 캡처 각도 반영)
        var headingBadgeHtml = "";
        if (wp.id === "Home" || wp.id === "Destination") {
            var capturedDeg = 0;
            if (wp.heading_deg !== undefined && !isNaN(parseFloat(wp.heading_deg))) {
                capturedDeg = parseFloat(wp.heading_deg);
            } else if (mainViewer && mainViewer.camera) {
                capturedDeg = Cesium.Math.toDegrees(mainViewer.camera.heading);
            }

            var bearing = calcTrueNorthBearing(capturedDeg);
            wp.heading_deg = bearing.deg;
            wp.heading_compass = bearing.code;
            if (wp.id === "Home") wp.heading_rad = bearing.rad;
            if (wp.id === "Destination") wp.heading_H = bearing.rad;

            var badgeColor = (wp.id === "Home") ? "#f1c40f" : "#2ecc71";
            var badgeBorder = (wp.id === "Home") ? "rgba(241, 196, 15, 0.35)" : "rgba(46, 204, 113, 0.35)";
            var badgeIcon = (wp.id === "Home") ? "🧭" : "🎯";

            headingBadgeHtml = `
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(0,0,0,0.45); padding: 5px 10px; border-radius: 4px; border: 1px solid ${badgeBorder}; white-space: nowrap;">
                    <span style="color: ${badgeColor}; font-weight: bold;">${badgeIcon} 기체기수:</span>
                    <strong style="color: #ffffff; font-family: monospace;">${bearing.text}</strong>
                </div>
            `;
        }

        var card = document.createElement("div");
        card.className = "gcs-waypoint-card" + (wp.id === "Home" ? " active" : "");
        card.id = "card_waypoint_" + wp.id;

        var themeColor = (wp.id === "Home") ? "#f1c40f" : (wp.id === "Destination") ? "#ef5350" : "#3498db";
        card.style.cssText = "margin: 4px 0 6px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid " + themeColor + "; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer; transition: 0.2s;";

        var cardTitle = wp.id === "Home" ? "🚩 출발지 (Home)" : (wp.id === "Destination" ? "🎯 목적지 (Destination)" : "🛸 경유지 (" + wp.id + ")");

        // [요구사항 1] 출발지는 '저장' 버튼, 나머지는 '삭제 X' 버튼 배치
        var actionBtnHtml = (wp.id === "Home") ?
            `<button class="gcs-home-save-btn" style="background: #f1c40f; border: none; color: #000; cursor: pointer; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; z-index: 10; transition: 0.2s;">💾 저장</button>` :
            `<button class="gcs-wp-delete-btn" style="background: #ef5350; border: none; color: #fff; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; z-index: 10;">삭제 X</button>`;

        var displayAddress = wp.address || (wp.id === "Home" ? "사용자 설정 락온 공역 출발지" : "자연 평지 공역");

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: bold; color: ${themeColor}; font-size: 14px;">${cardTitle}</span>
                ${actionBtnHtml}
            </div>
            ${headingBadgeHtml}
            <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5; margin-top: 6px; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #fff; margin-bottom: 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">지점: ${displayAddress}</div>
                <div style="display: flex; gap: 12px; font-family: monospace;">
                    <span>X: ${numLon.toFixed(6)}</span>
                    <span>Y: ${numLat.toFixed(6)}</span>
                </div>
            </div>

            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 2px; width: 100%; box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 2px; font-size: 11px; color: #bdc3c7; white-space: nowrap;">
                    <span>${heightLabelText}:</span>
                    <strong style="color: ${labelStyleColor}; font-size: 11px;">${finalCalculatedHeight}m</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 2px; white-space: nowrap;">
                    <span style="font-weight: bold; color: ${themeColor}; font-size: 11px;">관제고도:</span>
                    <div style="display: inline-flex; align-items: center; background: #111; border: 1px solid ${themeColor}; border-radius: 3px; padding: 1px 2px;">
                        <button class="gcs-wp-alt-down-scroll" style="background:none; border:none; color:${themeColor}; cursor:pointer; font-weight:bold; font-size:9px; padding:0 1px; line-height:1;">▼</button>
                        <input type="number" class="gcs-node-alt-dynamic-input" value="${absoluteControlAlt}" style="width: 36px; background: transparent; color: ${themeColor}; border: none; text-align: center; font-size: 11px; font-weight: bold; padding: 0; margin: 0; -webkit-appearance: none; -moz-appearance: textfield;" readonly />
                        <button class="gcs-wp-alt-up-scroll" style="background:none; border:none; color:${themeColor}; cursor:pointer; font-weight:bold; font-size:9px; padding:0 1px; line-height:1;">▲</button>
                    </div>
                    <span style="color: ${themeColor}; font-weight: bold; font-size: 11px;">m</span>
                </div>
            </div>
        `;

        // [요구사항 1] 출발지 '저장' 버튼 클릭 이벤트: 확인창 없이 즉시 영구 저장 및 시각 피드백
        var saveBtn = card.querySelector(".gcs-home-save-btn");
        if (saveBtn) {
            saveBtn.addEventListener("click", function (e) {
                e.stopPropagation(); // 카드 이동 클릭과 겹치지 않도록 방지

                var homeSavePayload = {
                    id: "Home",
                    lon: numLon,
                    lat: numLat,
                    alt: parseFloat(wp.alt) || 150,
                    roofBase: finalCalculatedHeight,
                    calculatedRoofHeight: finalCalculatedHeight,
                    address: displayAddress,
                    heading_deg: wp.heading_deg || 0
                };
                localStorage.setItem("gcs_permanent_home_lock", JSON.stringify(homeSavePayload));

                // 버튼 텍스트로 즉시 저장 완료 피드백 표시 (팝업 없음)
                var originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = "✅ 저장됨";
                saveBtn.style.background = "#2ecc71";
                saveBtn.style.color = "#fff";
                setTimeout(function () {
                    saveBtn.innerHTML = originalText;
                    saveBtn.style.background = "#f1c40f";
                    saveBtn.style.color = "#000";
                }, 1200);
            });
        }

        // 고도 조절 버튼 이벤트 (목적지 및 건물은 1층 높이까지 하강 가능 & 3m=1층 단위 조절)
        var stepMeters = (wp.id === "Destination" || isBuildingNode) ? 3 : 5;
        var minAllowedAlt = finalCalculatedHeight + 10;
        if ((wp.id === "Destination" || isBuildingNode) && mainViewer && mainViewer.scene && mainViewer.scene.globe) {
            var groundElev = mainViewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(numLon, numLat)) || 86;
            minAllowedAlt = Math.round(groundElev) + 3; // 1층 높이까지 하강 허용
        }

        card.querySelector(".gcs-wp-alt-down-scroll").addEventListener("click", function (e) {
            e.stopPropagation();
            var inputEl = card.querySelector(".gcs-node-alt-dynamic-input");
            var nextVal = Math.max(minAllowedAlt, (parseInt(inputEl.value, 10) || 150) - stepMeters);
            inputEl.value = nextVal; wp.alt = nextVal; wp.altitude_Z = nextVal;
            if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        });
        card.querySelector(".gcs-wp-alt-up-scroll").addEventListener("click", function (e) {
            e.stopPropagation();
            var inputEl = card.querySelector(".gcs-node-alt-dynamic-input");
            var nextVal = Math.min(1200, (parseInt(inputEl.value, 10) || 150) + stepMeters);
            inputEl.value = nextVal; wp.alt = nextVal; wp.altitude_Z = nextVal;
            if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        });



        // 삭제 버튼 이벤트
        var delBtn = card.querySelector(".gcs-wp-delete-btn");
        if (delBtn) {
            delBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                window.GcsApp.state.waypointList = window.GcsApp.state.waypointList.filter(function (item) { return item.id !== wp.id; });
                window.waypointList = window.GcsApp.state.waypointList;
                window.gcsAutoNodesPreparedGuard = false;
                if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
                window.renderWaypointListUI();
            });
        }
        // [요구사항 3] 카드 클릭 시 2D·3D 모드 관계없이 해당 노드를 화면 정중앙으로 이동
        card.addEventListener("click", function () {
            window.focusGcsNodeOnMap(numLon, numLat, finalCalculatedHeight);
        });

        container.appendChild(card);
    });
};


window.updateHeightFromInput = function (id, h) {
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    var target = list.find(function (w) { return w.id === id; });
    if (target) {
        var defaultAlt = (window.GcsApp && window.GcsApp.CONFIG && window.GcsApp.CONFIG.DEFAULT_ALTITUDE) ? window.GcsApp.CONFIG.DEFAULT_ALTITUDE : 150.0;
        target.alt = parseFloat(h) || defaultAlt;
        if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    }
};
window.deleteWaypoint = function (id) {
    var filtered = window.GcsApp.state.waypointList.filter(function (w) { return w.id !== id; });
    var clean = []; var c = 1;
    filtered.forEach(function (wp, i) {
        var lbl = (i === 0) ? "Home" : (i === filtered.length - 1) ? "Destination" : "WP_" + c++;
        clean.push({ id: lbl, lon: wp.lon, lat: wp.lat, alt: parseFloat(wp.alt) || window.GcsApp.CONFIG.DEFAULT_ALTITUDE, roofBase: wp.roofBase, address: wp.address });
    });
    window.GcsApp.state.waypointList = clean; window.waypointList = clean;
    window.rebuildGcsPipelineAndLabels();
    window.renderWaypointListUI();
};


// =========================================================================
// 📤 [완치본] 외부 CSS 간섭 차단(DOM 직접 생성 + !important) 표 & JSON 모달
// =========================================================================
window.exportMissionJSON = function () {
    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList)
        ? window.GcsApp.state.waypointList
        : (window.waypointList || []);

    if (!Array.isArray(list) || list.length < 2) {
        alert("⚠️ 출발지(Home)와 목적지(Destination)를 먼저 설정해 주세요.");
        return;
    }

    var hasAutoWp = list.some(function (n) { return n && String(n.id).startsWith("WP_AUTO_"); });
    if (!hasAutoWp && typeof window.runGcsRouteOptimization === "function") {
        window.runGcsRouteOptimization();
        list = window.GcsApp.state.waypointList || list;
    }

    var scene = (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) ? ws3d.viewer.scene : null;

    var calcBearingDeg = function (fromNode, toNode) {
        if (!fromNode || !toNode || Array.isArray(toNode)) return 0;
        var p1 = Cesium.Cartesian3.fromDegrees(parseFloat(fromNode.lon), parseFloat(fromNode.lat), 0);
        var p2 = Cesium.Cartesian3.fromDegrees(parseFloat(toNode.lon), parseFloat(toNode.lat), 0);
        try {
            var invMat = Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(p1), new Cesium.Matrix4());
            if (Cesium.defined(invMat)) {
                var localVec = Cesium.Matrix4.multiplyByPoint(invMat, p2, new Cesium.Cartesian3());
                var deg = Math.round(Cesium.Math.toDegrees(Math.atan2(localVec.x, localVec.y))) % 360;
                if (deg < 0) deg += 360;
                return isNaN(deg) ? 0 : deg;
            }
        } catch (e) { }
        return 0;
    };

    var homeNode = list.find(function (n) { return n && String(n.id).toLowerCase() === "home"; }) || list[0];
    var destNode = list.find(function (n) { return n && n.id === "Destination"; }) || list[list.length - 1];

    var missionWaypoints = list.map(function (w, idx) {
        var lon = parseFloat(w.lon);
        var lat = parseFloat(w.lat);
        var altAmsl = Math.round(parseFloat(w.alt) || 150);
        var baseHeight = Math.round(parseFloat(w.roofBase) || 0);

        var terrainHeight = 86;
        if (scene && scene.globe) {
            var gH = scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
            if (gH && !isNaN(gH) && gH > 0) terrainHeight = Math.round(gH);
        }
        var floorRefHeight = baseHeight > 0 ? baseHeight : terrainHeight;
        var altAgl = Math.max(0, altAmsl - floorRefHeight);

        var commandType = "WAYPOINT";
        var targetHeadingDeg = 0;
        var holdTimeSec = 1.5;
        var speedMps = 10.0;

        if (w.id === "Home") {
            commandType = "TAKEOFF";
            targetHeadingDeg = (list.length > 1) ? calcBearingDeg(w, list[1]) : (w.heading_deg || 0);
            holdTimeSec = 4.5;
            speedMps = 5.0;
        } else if (w.id === "Destination") {
            commandType = "LAND";
            targetHeadingDeg = (w.heading_deg !== undefined && !isNaN(parseFloat(w.heading_deg)))
                ? Math.round(parseFloat(w.heading_deg))
                : calcBearingDeg(list[idx - 1], w);
            holdTimeSec = 0.0;
            speedMps = 2.0;
        } else if (String(w.id).startsWith("WP_AUTO_GUARD") || (Math.abs(lon - parseFloat(destNode.lon)) < 0.00001 && Math.abs(lat - parseFloat(destNode.lat)) < 0.00001)) {
            commandType = "HOVER_ALIGN";
            targetHeadingDeg = (destNode.heading_deg !== undefined && !isNaN(parseFloat(destNode.heading_deg)))
                ? Math.round(parseFloat(destNode.heading_deg))
                : calcBearingDeg(list[idx - 1], w);
            holdTimeSec = 3.5;
            speedMps = 8.0;
        } else {
            commandType = "WAYPOINT";
            targetHeadingDeg = (idx + 1 < list.length) ? calcBearingDeg(w, list[idx + 1]) : 0;
            holdTimeSec = 1.5;
            speedMps = 10.0;
        }

        var wpPayload = {
            seq: idx + 1,
            node_id: w.id,
            command: commandType,
            address: w.address || "관제 공역",
            longitude_X: parseFloat(lon.toFixed(6)),
            latitude_Y: parseFloat(lat.toFixed(6)),
            altitude_amsl: altAmsl,
            altitude_agl: altAgl,
            base_height_m: floorRefHeight,
            heading_deg: targetHeadingDeg,
            hold_time_sec: holdTimeSec,
            speed_mps: speedMps
        };

        if (w.id === "Destination") {
            var heightFromGround = Math.max(0, altAmsl - terrainHeight);
            wpPayload.target_floor = Math.max(1, Math.round(heightFromGround / 3.0));
        }

        return wpPayload;
    });

    var finalMissionObject = {
        mission_id: "GCS_MISSION_" + new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14),
        created_at: new Date().toLocaleString("ko-KR"),
        coordinate_frame: "WGS84_AMSL",
        total_waypoints: missionWaypoints.length,
        estimated_flight_time_sec: window.gcsLiveTimeSumRef ? Math.round(window.gcsLiveTimeSumRef) : Math.round(12 + (missionWaypoints.length * 5.5)),
        home_position: {
            longitude_X: parseFloat(parseFloat(homeNode.lon).toFixed(6)),
            latitude_Y: parseFloat(parseFloat(homeNode.lat).toFixed(6)),
            base_height_m: Math.round(parseFloat(homeNode.roofBase) || 0),
            takeoff_altitude_m: Math.round(parseFloat(homeNode.alt) || 150)
        },
        waypoints: missionWaypoints
    };

    var jsonPrettyString = JSON.stringify(finalMissionObject, null, 2);

    // 기존 모달 제거
    var oldModal = document.getElementById("gcs_json_preview_modal");
    if (oldModal) oldModal.remove();

    // 외부 CSS 격리용 전용 스타일 시트 주입
    var styleId = "gcs_modal_isolated_css";
    var oldStyle = document.getElementById(styleId);
    if (oldStyle) oldStyle.remove();

    var styleTag = document.createElement("style");
    styleTag.id = styleId;
    styleTag.textContent = `
        #gcs_json_preview_modal, #gcs_json_preview_modal * {
            box-sizing: border-box !important;
            font-family: 'Malgun Gothic', sans-serif !important;
        }
        #gcs_json_preview_modal {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100vw !important; height: 100vh !important;
            background: rgba(0, 0, 0, 0.78) !important;
            z-index: 9999999 !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
        }
        #gcs_modal_box {
            width: 880px !important; max-width: 95vw !important; max-height: 88vh !important;
            background: #101828 !important; border: 2px solid #00ffcc !important; border-radius: 8px !important;
            box-shadow: 0 12px 35px rgba(0,0,0,0.75) !important;
            display: flex !important; flex-direction: column !important; overflow: hidden !important; color: #fff !important;
        }
        #gcs_modal_header {
            padding: 14px 20px !important; background: #1e293b !important;
            border-bottom: 1px solid rgba(0,255,204,0.3) !important;
            display: flex !important; flex-direction: row !important;
            justify-content: space-between !important; align-items: center !important;
        }
        #gcs_modal_subbar {
            padding: 10px 20px !important; background: #0f172a !important; font-size: 12px !important;
            border-bottom: 1px solid rgba(255,255,255,0.08) !important;
            display: flex !important; flex-direction: row !important;
            justify-content: space-between !important; align-items: center !important;
        }
        #gcs_modal_table_wrap {
            width: 100% !important; overflow-x: auto !important; overflow-y: auto !important;
            max-height: 54vh !important; background: #0b0f19 !important; display: block !important;
        }
        #gcs_modal_table {
            width: 100% !important; border-collapse: collapse !important;
            font-size: 12px !important; display: table !important;
        }
        #gcs_modal_table thead { display: table-header-group !important; background: #1e293b !important; }
        #gcs_modal_table tbody { display: table-row-group !important; }
        #gcs_modal_table tr { display: table-row !important; border-bottom: 1px solid rgba(255,255,255,0.08) !important; }
        #gcs_modal_table th, #gcs_modal_table td {
            display: table-cell !important; padding: 10px 8px !important;
            text-align: center !important; vertical-align: middle !important; white-space: nowrap !important;
        }
        #gcs_modal_table th { color: #00ffcc !important; border-bottom: 2px solid #00ffcc !important; font-weight: bold !important; }
        #gcs_json_preview_textarea {
            display: none; width: 100% !important; height: 360px !important;
            background: #0b0f19 !important; color: #a7f3d0 !important;
            border: none !important; padding: 16px 20px !important;
            font-family: 'Consolas', monospace !important; font-size: 12px !important;
            line-height: 1.55 !important; resize: none !important; outline: none !important;
        }
        #gcs_modal_footer {
            padding: 12px 20px !important; background: #1e293b !important;
            border-top: 1px solid rgba(255,255,255,0.1) !important;
            display: flex !important; flex-direction: row !important;
            justify-content: flex-end !important; align-items: center !important; gap: 10px !important;
        }
        .gcs-m-btn {
            display: inline-block !important; width: auto !important; height: auto !important;
            padding: 7px 14px !important; border-radius: 4px !important; font-weight: bold !important; font-size: 12px !important; cursor: pointer !important;
}
`;
document.head.appendChild(styleTag);
// 표 행 생성
var tableRowsHtml = missionWaypoints.map(function (wp) {
var badgeBg = "rgba(56, 189, 248, 0.18)", badgeColor = "#38bdf8";
if (wp.command === "TAKEOFF") { badgeBg = "rgba(241, 196, 15, 0.2)"; badgeColor = "#f1c40f"; }
else if (wp.command === "LAND") { badgeBg = "rgba(239, 83, 80, 0.2)"; badgeColor = "#ef5350"; }
else if (wp.command === "HOVER_ALIGN") { badgeBg = "rgba(0, 255, 204, 0.18)"; badgeColor = "#00ffcc"; }

var floorBadge = wp.target_floor ?  `<span style="color:#fffa65; font-weight:bold;">(${wp.target_floor}층)</span>` : "";
return `
${wp.seq}
\(wp.node_{i}d\){floorBadge}${wp.command}${wp.longitude_X.toFixed(6)}${wp.latitude_Y.toFixed(6)}\({wp.altitude_amsl}m <span style="font-size:11px; color:#94a3b8;">(+\){wp.altitude_agl}m)${wp.heading_deg}°${wp.hold_time_sec}초${wp.speed_mps}m/s`;
}).join("");
var modalOverlay = document.createElement("div");
modalOverlay.id = "gcs_json_preview_modal";
modalOverlay.innerHTML = `


🛸 드론 자율비행 임무경로 데이터 명세
✕



• 총 노드: ${missionWaypoints.length}개
• 예상 비행시간: ${finalMissionObject.estimated_flight_time_sec}초
• 목적지 층수: ${missionWaypoints[missionWaypoints.length - 1].target_floor || "-"}층


📊 표(테이블) 보기
💻 JSON 원문 보기


${tableRowsHtml}

순번	노드 ID (층수)	임무 명령	경도 (X)	위도 (Y)	해발고도 (상대)	기수 방위각	호버링	속도

${jsonPrettyString}

📋 JSON 복사
💾 JSON 파일 저장
닫기


`;
document.body.appendChild(modalOverlay);
// 탭 전환 이벤트
var tableBtn = document.getElementById("gcs_tab_table_btn");
var jsonBtn = document.getElementById("gcs_tab_json_btn");
var tableWrap = document.getElementById("gcs_modal_table_wrap");
var jsonArea = document.getElementById("gcs_json_preview_textarea");
tableBtn.onclick = function () {
tableWrap.style.setProperty("display", "block", "important");
jsonArea.style.setProperty("display", "none", "important");
tableBtn.style.setProperty("background", "#00ffcc", "important");
tableBtn.style.setProperty("color", "#000", "important");
jsonBtn.style.setProperty("background", "transparent", "important");
jsonBtn.style.setProperty("color", "#cbd5e1", "important");
};
jsonBtn.onclick = function () {
tableWrap.style.setProperty("display", "none", "important");
jsonArea.style.setProperty("display", "block", "important");
jsonBtn.style.setProperty("background", "#00ffcc", "important");
jsonBtn.style.setProperty("color", "#000", "important");
tableBtn.style.setProperty("background", "transparent", "important");
tableBtn.style.setProperty("color", "#cbd5e1", "important");
};
// 닫기 / 복사 / 파일 저장 이벤트
document.getElementById("gcs_json_modal_close_x").onclick = function () { modalOverlay.remove(); };
document.getElementById("gcs_json_close_btn").onclick = function () { modalOverlay.remove(); };
modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) modalOverlay.remove(); });
document.getElementById("gcs_json_copy_btn").onclick = function () {
navigator.clipboard.writeText(jsonPrettyString);
var btn = this;
btn.innerText = "✅ 복사 완료!";
setTimeout(function () { btn.innerText = "📋 JSON 복사"; }, 1500);
};
document.getElementById("gcs_json_download_file_btn").onclick = function () {
var blob = new Blob([jsonPrettyString], { type: "application/json;charset=utf-8" });
var a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = finalMissionObject.mission_id + ".json";
a.click();
};
};




window.importMissionJSON = function (e) {
    if (!e.target || !e.target.files || e.target.files.length === 0) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
        try {
            var parsed = JSON.parse(evt.target.result);
            window.GcsApp.state.waypointList = [];
            parsed.forEach(function (w) { window.GcsApp.state.waypointList.push({ id: w.id || "WP_" + w.index, lon: w.longitude_X, lat: w.latitude_Y, alt: w.altitude_Z, roofBase: 0, address: "자연 지표면 평지 공역" }); });
            window.waypointList = window.GcsApp.state.waypointList;
            window.rebuildGcsPipelineAndLabels(); window.renderWaypointListUI();
        } catch (err) { alert("파일 형식이 다릅니다."); }
    };
    reader.readAsText(e.target.files);
};
window.switchGcsMode = function (mode) {
    if (!ws3d || !ws3d.viewer) return;
    var canvas = ws3d.viewer.scene.canvas;
    var ray = ws3d.viewer.scene.camera.getPickRay(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    var targetCartesian = ws3d.viewer.scene.globe.pick(ray, ws3d.viewer.scene);
    var centerLon = 126.9780, centerLat = 37.5665, currentHeight = ws3d.viewer.camera.positionCartographic.height;
    if (Cesium.defined(targetCartesian)) { var carto = Cesium.Cartographic.fromCartesian(targetCartesian); centerLon = Cesium.Math.toDegrees(carto.longitude); centerLat = Cesium.Math.toDegrees(carto.latitude); }
    ws3d.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    var btn2d = document.getElementById("btn_2d"), btn3d = document.getElementById("btn_3d");
    if (mode === '2D') {
        window.GcsApp.state.isDrawingMode = true; if (btn2d) btn2d.classList.add("active"); if (btn3d) btn3d.classList.remove("active");
        ws3d.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, currentHeight > 0 ? currentHeight : 350.0), orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 }, duration: 1.0 });
    } else {
        window.GcsApp.state.isDrawingMode = false; if (btn2d) btn2d.classList.remove("active"); if (btn3d) btn3d.classList.add("active");
        ws3d.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.002, currentHeight > 0 ? currentHeight : 300.0), orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-45.0), roll: 0.0 }, duration: 1.0 });
    }
};

window.gcsInjectMasterLayoutCssShield = function () {
    var shieldId = "gcs_html_layout_shield"; var existingStyle = document.getElementById(shieldId); if (existingStyle) existingStyle.remove();
    var styleEl = document.createElement("style"); styleEl.id = shieldId;
    var cssRules = "";
    if (window.isGcsDroneFlyingActive === true) { cssRules += `.gcs-dynamic-info-panel, #gcs_hud_details { display: ${window.isGcsLayoutSwapped ? 'grid' : 'block'} !important; visibility: visible !important; opacity: 1 !important; height: ${window.isGcsLayoutSwapped ? '140px' : 'auto'} !important; };` }
    else { cssRules += `.gcs-dynamic-info-panel, #gcs_hud_details { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0px !important; padding: 0px !important; margin: 0px !important; border: none !important; };` }
    styleEl.innerHTML = cssRules; document.head.appendChild(styleEl);
};
window.switchGcsMainWindowAndHud = function (forceLargeMode) {
    var mapContainer = document.getElementById("vmap"); var hudContainer = document.getElementById("gcs_internal_hud_container"); var radarCanvas = document.getElementById("gcs_hud_minimap_canvas"); var hudHeaderBar = document.getElementById("gcs_hud_header"); var flightInfoArea = document.getElementById("gcs_hud_details");
    if (!mapContainer || !hudContainer) return;
    if (typeof window.GcsThreeRadar !== "undefined" && window.GcsThreeRadar.cameraState) { window.GcsThreeRadar.cameraState.isTargeting = false; }
    if (typeof forceLargeMode === "boolean") { window.isGcsLayoutSwapped = forceLargeMode; } else { window.isGcsLayoutSwapped = !window.isGcsLayoutSwapped; }
    hudContainer.style.position = "fixed"; window.gcsInjectMasterLayoutCssShield();
    if (window.isGcsLayoutSwapped) {
        hudContainer.style.left = "0px"; hudContainer.style.top = "0px"; hudContainer.style.width = "100vw"; hudContainer.style.height = "100vh"; hudContainer.style.zIndex = "999"; hudContainer.style.display = "block"; hudContainer.style.background = "#0b0f19"; hudContainer.style.margin = "0px"; hudContainer.style.padding = "0px";
        if (hudHeaderBar) { hudHeaderBar.style.position = "absolute"; hudHeaderBar.style.top = "0px"; hudHeaderBar.style.left = "0px"; hudHeaderBar.style.width = "100vw"; hudHeaderBar.style.height = "55px"; hudHeaderBar.style.background = "#101828"; hudHeaderBar.style.zIndex = "1000000"; hudHeaderBar.style.display = "flex"; hudHeaderBar.style.alignItems = "center"; hudHeaderBar.style.justifyContent = "space-between"; hudHeaderBar.style.padding = "0 30px"; hudHeaderBar.style.boxSizing = "border-box"; }
        if (radarCanvas) { radarCanvas.style.position = "absolute"; radarCanvas.style.top = "55px"; radarCanvas.style.left = "0px"; radarCanvas.style.width = "100vw"; radarCanvas.style.height = window.isGcsDroneFlyingActive ? "calc(100vh - 195px)" : "calc(100vh - 55px)"; radarCanvas.style.zIndex = "1"; }
        if (flightInfoArea && window.isGcsDroneFlyingActive) { flightInfoArea.style.position = "absolute"; flightInfoArea.style.bottom = "0px"; flightInfoArea.style.left = "0px"; flightInfoArea.style.width = "100vw"; flightInfoArea.style.height = "140px"; flightInfoArea.style.background = "rgba(16, 24, 40, 0.96)"; flightInfoArea.style.borderTop = "2px solid #00ffcc"; flightInfoArea.style.padding = "20px 30px"; flightInfoArea.style.boxSizing = "border-box"; flightInfoArea.style.display = "grid"; flightInfoArea.style.gridTemplateColumns = "repeat(4, 1fr)"; flightInfoArea.style.gap = "15px"; flightInfoArea.style.zIndex = "10"; }
        mapContainer.style.position = "fixed"; mapContainer.style.width = "380px"; mapContainer.style.height = "240px"; mapContainer.style.right = "30px"; mapContainer.style.bottom = window.isGcsDroneFlyingActive ? "170px" : "30px"; mapContainer.style.left = "auto"; mapContainer.style.top = "auto"; mapContainer.style.zIndex = "1000"; mapContainer.style.border = "2px solid #00ffcc"; mapContainer.style.borderRadius = "6px";
    } else {
        mapContainer.style.position = "absolute"; mapContainer.style.width = "100%"; mapContainer.style.height = "100%"; mapContainer.style.left = "0px"; mapContainer.style.top = "0px"; mapContainer.style.zIndex = "1";
        if (hudHeaderBar) { hudHeaderBar.style.position = "static"; hudHeaderBar.style.width = "100%"; hudHeaderBar.style.background = "#2c3e50"; hudHeaderBar.style.padding = "10px 15px"; hudHeaderBar.style.display = "flex"; }
        hudContainer.style.width = "380px"; hudContainer.style.height = "auto"; hudContainer.style.zIndex = "100"; hudContainer.style.background = "rgba(16, 23, 41, 0.95)";
        if (window.gcsHudPositionMemory && window.gcsHudPositionMemory.left !== "auto") { hudContainer.style.left = window.gcsHudPositionMemory.left; hudContainer.style.top = window.gcsHudPositionMemory.top; } else { hudContainer.style.left = "auto"; hudContainer.style.top = "auto"; hudContainer.style.right = "20px"; hudContainer.style.bottom = "20px"; }
        if (radarCanvas) { radarCanvas.style.position = "static"; radarCanvas.style.width = "100%"; radarCanvas.style.height = window.isGcsDroneFlyingActive ? "150px" : "280px"; radarCanvas.height = window.isGcsDroneFlyingActive ? 150 : 280; }
        if (flightInfoArea && window.isGcsDroneFlyingActive) { flightInfoArea.style.position = "static"; flightInfoArea.style.width = "100%"; flightInfoArea.style.height = "auto"; flightInfoArea.style.background = "rgba(15, 23, 42, 0.9)"; flightInfoArea.style.padding = "12px 15px"; }
    }
    setTimeout(function () { if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) { ws3d.viewer.resize(); } if (window.GcsThreeRadar && typeof window.GcsThreeRadar.resize === "function") { window.GcsThreeRadar.resize(); window.GcsThreeRadar.update([], 0, 0, 0); } }, 80);
};
window.gcsBlockRadarClearFlag = true;
(function () {
    var canvas = document.getElementById("gcs_hud_minimap_canvas"); if (!canvas || !window.GcsThreeRadar) return;
    canvas.addEventListener('mousemove', function (e) { if (window.GcsThreeRadar.cameraState && window.GcsThreeRadar.cameraState.isTargeting) { if (window.GcsThreeRadar.renderer && window.GcsThreeRadar.scene && window.GcsThreeRadar.camera) { if (typeof window.GcsThreeRadar.updateCameraPosition === "function") { window.GcsThreeRadar.updateCameraPosition(); } window.GcsThreeRadar.renderer.render(window.GcsThreeRadar.scene, window.GcsThreeRadar.camera); } } }, { passive: true });
    canvas.addEventListener('wheel', function (e) { setTimeout(function () { if (window.GcsThreeRadar.renderer && window.GcsThreeRadar.scene && window.GcsThreeRadar.camera) { if (typeof window.GcsThreeRadar.updateCameraPosition === "function") { window.GcsThreeRadar.updateCameraPosition(); } window.GcsThreeRadar.renderer.render(window.GcsThreeRadar.scene, window.GcsThreeRadar.camera); } }, 5); }, { passive: true });
    if (window.GcsThreeRadar.renderer) { var gl = window.GcsThreeRadar.renderer.getContext(); if (gl) { window.GcsThreeRadar.renderer.autoClear = false; } }
})();
window.gcsIsSubsequentFlightActive = false;

(function gcsLinkTriggerActive() {
    var allButtons = document.querySelectorAll('button, input[type="button"], .btn');
    allButtons.forEach(function (btnEl) { if (btnEl.innerText && (btnEl.innerText.indexOf("HUD") !== -1 || btnEl.innerText.indexOf("계기판") !== -1)) { if (!btnEl.isGcsLayoutHooked) { btnEl.addEventListener('click', function () { window.isGcsDroneFlyingActive = false; setTimeout(function () { if (typeof window.switchGcsMainWindowAndHud === "function") { window.switchGcsMainWindowAndHud(true); } }, 60); }); btnEl.isGcsLayoutHooked = true; } } });
})();
window.gcsInjectMasterLayoutCssShield();
setTimeout(function () {
    var checkLock = localStorage.getItem("gcs_permanent_home_lock");
    if (checkLock && window.GcsApp && window.GcsApp.state) {
        var parsed = JSON.parse(checkLock);
        var activeHome = {
            id: "Home",
            lon: parseFloat(parsed.lon),
            lat: parseFloat(parsed.lat),
            alt: parseFloat(parsed.alt || 150),
            roofBase: parsed.calculatedRoofHeight || parsed.roofBase || 0,
            address: parsed.address || "사용자 지정 출발지 공역"
        };
        var currentList = window.GcsApp.state.waypointList || [];
        if (currentList.length === 0) {
            currentList.push(activeHome);
            window.GcsApp.state.waypointList = currentList;
            window.waypointList = currentList;
        }
    }
    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
}, 2000);



// =========================================================================
// 🚀 [통합 경로 최적화 엔진] 수동 경유지 100% 보존 + 자동 WP 및 목적지 상공 가드 생성
// =========================================================================
window.runGcsRouteOptimization = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return null;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
    if (!Array.isArray(list) || list.length < 2) return null;

    var homeNode = list.find(function (n) { return n && String(n.id).toLowerCase() === "home"; });
    var destNode = list.find(function (n) { return n && n.id === "Destination"; });
    if (!homeNode || !destNode) return null;

    // 1. 지형·건물 최고 장애물 스캔 및 안전 순항고도 산출
    var optResult = (typeof window.gcsExecuteTerrainOptimizationReturnData === "function")
        ? window.gcsExecuteTerrainOptimizationReturnData()
        : null;
    var finalCruiseSafeAlt = optResult ? optResult.recommendedSafeAltitude : 232.0;
    var maxObstacleHeight = optResult ? optResult.maxApartmentHeight : 172.0;

    // 2. 출발지 고도 격상 (목적지는 원래 바닥/옥상 착륙 고도 유지)
    homeNode.alt = finalCruiseSafeAlt;
    homeNode.altitude_Z = finalCruiseSafeAlt;
    var destBaseH = parseFloat(destNode.roofBase) || 0;
    if (destBaseH > 0 && destNode.alt <= destBaseH) {
        destNode.alt = destBaseH + 20;
    }

    // 3. 사용자가 직접 찍은 경유지(WP_1, WP_2 등)는 절대 지우지 않고 모두 보존
    var userWaypoints = list.filter(function (n) {
        return n &&
            String(n.id).toLowerCase() !== "home" &&
            n.id !== "Destination" &&
            !String(n.id).startsWith("WP_AUTO_");
    });

    var newList = [homeNode];
    var addedWpLogs = [];
    var homeCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(homeNode.lon), parseFloat(homeNode.lat), 0);
    var destCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNode.lon), parseFloat(destNode.lat), 0);
    var flightFlatDistance = Cesium.Cartesian3.distance(homeCartesian, destCartesian);

    if (userWaypoints.length > 0) {
        // [A] 사용자가 경유지를 직접 추가한 경우: 기존 경유지 유지 + 고도 동기화 + 목적지 상공 가드 WP 추가
        userWaypoints.forEach(function (wp, idx) {
            wp.id = "WP_" + (idx + 1);
            wp.alt = finalCruiseSafeAlt;
            wp.altitude_Z = finalCruiseSafeAlt;
            newList.push(wp);
            addedWpLogs.push(`• [기존 유지] ${wp.id} (안전고도 ${finalCruiseSafeAlt}m 동기화)`);
        });

        var guardWp = {
            id: "WP_AUTO_GUARD",
            lon: destNode.lon,
            lat: destNode.lat,
            alt: finalCruiseSafeAlt,
            roofBase: finalCruiseSafeAlt - 10,
            address: "🛬 목적지 직상공 수직 가드 공역",
            isBuilding: false
        };
        newList.push(guardWp);
        addedWpLogs.push(`• [자동 추가] WP_AUTO_GUARD (목적지 직상공 수직 하강 유도: ${finalCruiseSafeAlt}m)`);
    } else {
        // [B] 수동 경유지가 없는 경우: 거리에 따른 회피 경유지 + 목적지 직상공 가드 WP 자동 생성
        if (flightFlatDistance < 500) {
            newList.push({
                id: "WP_AUTO_1", lon: destNode.lon, lat: destNode.lat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "🛬 목적지 직상공 수직 가드 공역", isBuilding: false
            });
            addedWpLogs.push(`• [자동 추가] WP_AUTO_1 (목적지 직상공 수직 가드: ${finalCruiseSafeAlt}m)`);
        } else if (flightFlatDistance >= 500 && flightFlatDistance < 1500) {
            var midLon = parseFloat(homeNode.lon) + (parseFloat(destNode.lon) - parseFloat(homeNode.lon)) * 0.50;
            var midLat = parseFloat(homeNode.lat) + (parseFloat(destNode.lat) - parseFloat(homeNode.lat)) * 0.50;
            newList.push({
                id: "WP_AUTO_1", lon: midLon, lat: midLat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "🏢 중간 구조물 우회 안전 공역", isBuilding: true
            });
            newList.push({
                id: "WP_AUTO_2", lon: destNode.lon, lat: destNode.lat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "🛬 목적지 직상공 수직 가드 공역", isBuilding: false
            });
            addedWpLogs.push(`• [자동 추가] WP_AUTO_1 (중간 회피 공역: ${finalCruiseSafeAlt}m)`);
            addedWpLogs.push(`• [자동 추가] WP_AUTO_2 (목적지 직상공 가드: ${finalCruiseSafeAlt}m)`);
        } else {
            var wp1Lon = parseFloat(homeNode.lon) + (parseFloat(destNode.lon) - parseFloat(homeNode.lon)) * 0.38;
            var wp1Lat = parseFloat(homeNode.lat) + (parseFloat(destNode.lat) - parseFloat(homeNode.lat)) * 0.38;
            newList.push({
                id: "WP_AUTO_1", lon: wp1Lon, lat: wp1Lat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "🏢 1차 장애물 상공 안전 공역", isBuilding: true
            });
            var wp2Lon = parseFloat(homeNode.lon) + (parseFloat(destNode.lon) - parseFloat(homeNode.lon)) * 0.68;
            var wp2Lat = parseFloat(homeNode.lat) + (parseFloat(destNode.lat) - parseFloat(homeNode.lat)) * 0.68;
            newList.push({
                id: "WP_AUTO_2", lon: wp2Lon, lat: wp2Lat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "⛰️ 2차 지형 우회 관제 공역", isBuilding: false
            });
            newList.push({
                id: "WP_AUTO_3", lon: destNode.lon, lat: destNode.lat, alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10, address: "🛬 목적지 직상공 수직 가드 공역", isBuilding: false
            });
            addedWpLogs.push(`• [자동 추가] WP_AUTO_1 (1차 장애물 회피: ${finalCruiseSafeAlt}m)`);
            addedWpLogs.push(`• [자동 추가] WP_AUTO_2 (2차 지형 우회: ${finalCruiseSafeAlt}m)`);
            addedWpLogs.push(`• [자동 추가] WP_AUTO_3 (목적지 직상공 가드: ${finalCruiseSafeAlt}m)`);
        }
    }

    newList.push(destNode);

    // 4. 전역 리스트 덮어쓰기 및 고정
    window.GcsApp.state.waypointList = newList;
    window.waypointList = newList;

    // 5. 지도상 3D 방위각 가이드라인(노란색 점선) 세팅
    var oldCompassLine = mainViewer.entities.getById("GCS_3D_MAP_COMPASS_LINE");
    if (oldCompassLine) mainViewer.entities.remove(oldCompassLine);

    var homeFloorH = parseFloat(homeNode.roofBase) || 86;
    var headingDeg = homeNode.heading_deg !== undefined ? homeNode.heading_deg : 0;
    var headingRad = Cesium.Math.toRadians(headingDeg);
    var arrowDist = 0.0015;

    mainViewer.entities.add({
        id: "GCS_3D_MAP_COMPASS_LINE",
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                parseFloat(homeNode.lon), parseFloat(homeNode.lat), homeFloorH + 1.5,
                parseFloat(homeNode.lon) + (arrowDist * Math.sin(headingRad)),
                parseFloat(homeNode.lat) + (arrowDist * Math.cos(headingRad)),
                homeFloorH + 1.5
            ]),
            width: 6.0,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.YELLOW, dashLength: 16.0 }),
            arcType: Cesium.ArcType.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    // 6. 좌측 카드 목록 UI 및 3D 삼각기둥·경로선 즉시 재빌드
    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    scene.requestRender();

    return {
        distance: Math.round(flightFlatDistance),
        maxObstacle: maxObstacleHeight,
        safeAlt: finalCruiseSafeAlt,
        logs: addedWpLogs
    };
};
