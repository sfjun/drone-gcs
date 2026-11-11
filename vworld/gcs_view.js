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

window.toggleGcsCameraViewMode = function () {
    window.gcsCameraTrackingModeActive = !window.gcsCameraTrackingModeActive;
    var btn = document.getElementById("btn_hud_view_swap");
    if (btn) {
        btn.innerText = window.gcsCameraTrackingModeActive ? "🔄 점검 뷰 모드" : "🔄 광역 탑뷰 모드";
        btn.style.background = window.gcsCameraTrackingModeActive ? "#e67e22" : "#27ae60";
    }
};

window.initGcsHudDraggable = function () {
    var hudContainer = document.getElementById("gcs_internal_hud_container") || document.querySelector('.gcs-hud-panel') || document.getElementById("hud");
    if (!hudContainer) return;
    var dragHandle = hudContainer.querySelector('#gcs_hud_header') || hudContainer;
    dragHandle.style.cursor = "move";
    var isDragging = false; var offsetPosition = { x: 0, y: 0 };
    dragHandle.addEventListener("mousedown", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || window.isGcsLayoutSwapped) return;
        isDragging = true; offsetPosition.x = e.clientX - hudContainer.offsetLeft; offsetPosition.y = e.clientY - hudContainer.offsetTop;
        document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", function (e) {
        if (!isDragging || window.isGcsLayoutSwapped) return;
        var nextX = e.clientX - offsetPosition.x; var nextY = e.clientY - offsetPosition.y;
        if (nextX < 0) nextX = 0; if (nextY < 0) nextY = 0;
        if (nextX > window.innerWidth - hudContainer.offsetWidth) nextX = window.innerWidth - hudContainer.offsetWidth;
        if (nextY > window.innerHeight - hudContainer.offsetHeight) nextY = window.innerHeight - hudContainer.offsetHeight;
        hudContainer.style.left = nextX + "px"; hudContainer.style.top = nextY + "px"; hudContainer.style.right = "auto"; hudContainer.style.bottom = "auto";
        window.gcsHudPositionMemory.left = nextX + "px"; window.gcsHudPositionMemory.top = nextY + "px"; window.gcsHudPositionMemory.right = "auto"; window.gcsHudPositionMemory.bottom = "auto";
    });
    document.addEventListener("mouseup", function () { if (isDragging) { isDragging = false; document.body.style.userSelect = "auto"; } });
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
// 🏢 [GCS 지형 스캔 최적화 엔진]
// =========================================================================
window.gcsExecuteTerrainOptimizationReturnData = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return null;
    var list = window.GcsApp?.state?.waypointList || window.waypointList || [];
    if (!list || !Array.isArray(list) || list.length < 2) return null;
    var recommendedSafeAltitude = 194.0;
    var maxTerrainHeight = 0;
    var scene = ws3d.viewer.scene;
    var SAFETY_MARGIN = 60.0;
    var scanSegments = 5;
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
            } catch (rayErr) {
                currentHighestAtPoint = pureTerrainHeight;
            }
            if (currentHighestAtPoint > maxTerrainHeight && currentHighestAtPoint < 400.0) {
                maxTerrainHeight = currentHighestAtPoint;
            }
        }
    }
    recommendedSafeAltitude = Math.round(maxTerrainHeight + SAFETY_MARGIN);
    if (recommendedSafeAltitude < 140 || recommendedSafeAltitude > 350) recommendedSafeAltitude = 194;
    return {
        maxApartmentHeight: Math.round(maxTerrainHeight || 0),
        maxMountainHeight: Math.round(maxTerrainHeight),
        recommendedSafeAltitude: recommendedSafeAltitude
    };
};
// =========================================================================
// 🛰️ [GCS 시점 관제 최종 완치] 후방 POV 사선 추적 카메라 동행 리스너
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
    if (elapsed >= (window.gcsLiveTimeSumRef - 0.05) || (window.gcsDroneLiveState && window.gcsDroneLiveState.currentStageString === "landing_done")) {
        if (!window.gcsDroneLiveState.isDestinationViewTriggered) {
            window.gcsDroneLiveState.isDestinationViewTriggered = true;
            window.gcsDroneLiveState.currentStageString = "landing_done";
            if (window.gcsStopwatchIntervalId) { clearInterval(window.gcsStopwatchIntervalId); window.gcsStopwatchIntervalId = null; }
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(destNode.lon, destNode.lat, alt + 45.0),
                orientation: { heading: window.gcsLiveHeadingRef, pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 },
                duration: 1.5,
                complete: function () {
                    mainViewer.trackedEntity = undefined;
                    mainViewer.clock.shouldAnimate = false;
                    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                    if (window.gcsDroneLiveState) window.gcsDroneLiveState.isTakeoffConfirmedGuard = undefined;
                    window.gcsIsSubsequentFlightActive = false;
                    window.gcsAutoNodesPreparedGuard = false; // 격발 토글 보호막 리셋
                    if (typeof window.gcsInitializeDestAltControls === "function") window.gcsInitializeDestAltControls();
                    if (typeof window.rebuildGcsPipelineAndLabels === "function") { window.rebuildGcsPipelineAndLabels(); }
                }
            });
        }
        return;
    }
    var t_wait = 1.0;
    var isActuallyClimbedUp = (alt >= (window.gcsLiveCurrentCruiseAltRef * 0.94));
    var homeHoverEndLimit = 5.5;
    if (elapsed <= t_wait) {
        stage = "takeoff_ready"; statusStr = "지면 모터 시동 대기"; labelColor = Cesium.Color.LIGHTGRAY;
    } else if (elapsed > t_wait && !isActuallyClimbedUp && elapsed < homeHoverEndLimit) {
        stage = "takeoff_climb"; statusStr = "이륙 및 수직 상승 기동"; labelColor = Cesium.Color.ORANGE;
    } else if (elapsed > t_wait && elapsed <= homeHoverEndLimit) {
        stage = "takeoff_hover"; statusStr = "이륙고도 안착 경로회전 정렬"; labelColor = Cesium.Color.YELLOW;
    } else if (elapsed > (window.gcsLiveTimeSumRef - 4.5) && elapsed <= (window.gcsLiveTimeSumRef - 1.5)) {
        stage = "dest_top_hover"; statusStr = "목적지 상공 정지 호버링"; labelColor = Cesium.Color.YELLOW;
    } else if (elapsed > (window.gcsLiveTimeSumRef - 1.5)) {
        stage = "descending_land"; statusStr = "목적지 기둥 천장 하강 착륙"; labelColor = Cesium.Color.DEEPPINK;
    } else {
        stage = "cruise"; statusStr = "임무 공역 자율 순항"; labelColor = Cesium.Color.CYAN;
        if (window.gcsHoverScheduleTimestamps && window.gcsHoverScheduleTimestamps.length > 1) {
            for (var k = 1; k < window.gcsHoverScheduleTimestamps.length; k++) {
                var sch = window.gcsHoverScheduleTimestamps[k];
                if (sch && elapsed >= sch.start && elapsed <= sch.end) { statusStr = "지정 노드 호버링 관제"; labelColor = Cesium.Color.YELLOW; break; }
            }
        }
    }
    if (window.gcsDroneLiveState) window.gcsDroneLiveState.currentStageString = stage;
    if (window.gcsSimulatedDroneEntity && window.gcsSimulatedDroneEntity.label) {
        window.gcsSimulatedDroneEntity.label.text = "🛸 " + statusStr + " (" + Math.round(alt) + "m)";
        window.gcsSimulatedDroneEntity.label.fillColor = labelColor;
    }
    var liveHeadingDegree = (window.gcsLiveHeadingRef * (180 / Math.PI));
    if (isNaN(liveHeadingDegree) || !isFinite(liveHeadingDegree)) liveHeadingDegree = 0.0;
    if (window.gcsCameraTrackingModeActive) {
        if (stage === "takeoff_ready" || stage === "takeoff_climb") {
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.trackedEntity = undefined;
        } else {
            mainViewer.trackedEntity = undefined;
            var targetCartesian = Cesium.Cartesian3.fromDegrees(destNode.lon, destNode.lat, alt);
            var flatDistance = Cesium.Cartesian3.distance(Cesium.Cartesian3.fromDegrees(lon, lat, alt), targetCartesian);
            var finalCameraHeading = window.gcsLiveHeadingRef;
            var lookDistance = 0.00065;
            var targetCamLon = lon - (lookDistance * Math.sin(finalCameraHeading));
            var targetCamLat = lat - (lookDistance * Math.cos(finalCameraHeading));
            var targetCamAlt = alt + 55.0;
            var dynamicPitchDegree = -18.0;
            if (flatDistance > 0 && flatDistance < 300) { dynamicPitchDegree = -18.0 - ((300 - flatDistance) / 300) * 22.0; }
            if (stage === "descending_land" || stage === "dest_top_hover") { dynamicPitchDegree = -90.0; targetCamLon = lon; targetCamLat = lat; targetCamAlt = alt + 65.0; }
            mainViewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(targetCamLon, targetCamLat, targetCamAlt),
                orientation: { heading: finalCameraHeading, pitch: Cesium.Math.toRadians(dynamicPitchDegree), roll: 0.0 }
            });
        }
    }
    var canvas = document.getElementById("gcs_hud_minimap_canvas");
    if (canvas && window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
        setTimeout(function () { try { window.GcsThreeRadar.update([], lon, lat, alt); } catch (e) { } }, 0);
    }
    if (currentHudContainer && currentHudContainer.style.display === "block") {
        if (elStatus) elStatus.innerText = statusStr;
        if (elStage) elStage.innerText = (stage.indexOf("takeoff_ready") !== -1 || stage.indexOf("takeoff_climb") !== -1 ? "🛫 이륙 및 고도 상승 고정" : (stage.indexOf("descending_land") !== -1 ? "🛬 목적지 정밀 착륙 하강" : "🛸 임무 공역 자율 순항"));
        if (elAlt) elAlt.innerText = Math.round(alt);
        if (elHeading) elHeading.innerText = liveHeadingDegree.toFixed(1);
        if (elCoords) elCoords.innerText = "X: " + lon.toFixed(5) + ", Y: " + lat.toFixed(5);
    }
};



// =========================================================================
// 🛫 [최종 통합 완치본] 4단계 수직/쾌속 우회 가드 및 목적지 정밀 하강 격발 엔진
// =========================================================================
window.startGcsDroneSimulation = function () {
    if (window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
        if (typeof window.GcsThreeRadar.init === "function") window.GcsThreeRadar.init();
    }
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;

    console.log("%c🚀 [GCS 최적화 엔진] 수직 이착륙 가드 링크 및 4단계 자율항행 타임라인 시동", "color: #00ffcc; font-weight: bold;");

    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    if (!list || !Array.isArray(list) || list.length < 2) {
        alert("⚠️ 출발지(Home)와 최종 목적지(Destination)를 구성해 주세요.");
        return;
    }

    var optResult = window.gcsExecuteTerrainOptimizationReturnData ? window.gcsExecuteTerrainOptimizationReturnData() : null;
    var finalCruiseSafeAlt = optResult ? optResult.recommendedSafeAltitude : 232.0;
    var maxObstacleHeight = optResult ? optResult.maxApartmentHeight : 172.0;

    if (isNaN(finalCruiseSafeAlt) || finalCruiseSafeAlt < 150) {
        finalCruiseSafeAlt = 232.0;
        maxObstacleHeight = 172.0;
    }

    var homeNode = list.find(function (n) { return n && n.id === "Home"; });
    var destNode = list.find(function (n) { return n && n.id === "Destination"; });

    // 💥 1단계 진입 인터록 - 출발/목적지 직상공 수직 가드 노드 포함 4단계 대통합 배치 가동
    if (window.gcsAutoNodesPreparedGuard === false && homeNode && destNode) {
        var userWaypoints = list.filter(function (n) { return n && !String(n.id).startsWith("WP_AUTO_") && n.id !== "Home" && n.id !== "Destination"; });

        if (userWaypoints.length === 0) {
            console.log("🔒 [GCS 인터록] 1단계: 사선 관통 박멸 수직 직상공 가드 및 10m 공역 기둥 사출");

            var autoWp1 = {
                id: "WP_AUTO_1",
                lon: homeNode.lon,
                lat: homeNode.lat,
                alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10,
                address: "🛫 출발지 직상공 수직 가드 공역",
                isBuilding: false
            };

            var autoWp2Lon = homeNode.lon + (destNode.lon - homeNode.lon) * 0.38;
            var autoWp2Lat = homeNode.lat + (destNode.lat - homeNode.lat) * 0.38;
            var autoWp2 = {
                id: "WP_AUTO_2",
                lon: autoWp2Lon,
                lat: autoWp2Lat,
                alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10,
                address: "🏢 206동 옥상 구속 안전 공역",
                isBuilding: true
            };

            var autoWp3Lon = homeNode.lon + (destNode.lon - homeNode.lon) * 0.68;
            var autoWp3Lat = homeNode.lat + (destNode.lat - homeNode.lat) * 0.68;
            var autoWp3 = {
                id: "WP_AUTO_3",
                lon: autoWp3Lon,
                lat: autoWp3Lat,
                alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10,
                address: "⛰️ 산정상 임계 우회 관제 공역",
                isBuilding: false
            };

            var autoWp4 = {
                id: "WP_AUTO_4",
                lon: destNode.lon,
                lat: destNode.lat,
                alt: finalCruiseSafeAlt,
                roofBase: finalCruiseSafeAlt - 10,
                address: "🛬 목적지 직상공 수직 가드 공역",
                isBuilding: false
            };

            var newList = [homeNode, autoWp1, autoWp2, autoWp3, autoWp4, destNode];
            window.GcsApp.state.waypointList = newList;
            window.waypointList = newList;
            list = newList;
        }

        if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
        if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        scene.requestRender();

        var totalWpBriefingMessage = "🛰️ GCS 자율항행 지형 최적화 1단계 통합 브리핑\n" +
            "=======================================\n\n" +
            "🚨 아파트 관통 차단을 위한 [4단계 회피 디딤돌] 배치 명세:\n\n" +
            "▶ [WP_AUTO_1] (출발지 직상공)\n" +
            "   - 지정 순항고도: " + finalCruiseSafeAlt + "m (안전 이격 마진 강착)\n\n" +
            "▶ [WP_AUTO_2] (휴먼시아 206동 상공)\n" +
            "   - 지정 순항고도: " + finalCruiseSafeAlt + "m (옥상 스치기 충돌 차단)\n\n" +
            "▶ [WP_AUTO_3] (중간 산정상 평지 공역)\n" +
            "   - 지정 순항고도: " + finalCruiseSafeAlt + "m (지형 추종 안전 고도)\n\n" +
            "▶ [WP_AUTO_4] (최종 목적지 직상공)\n" +
            "   - 지정 순항고도: " + finalCruiseSafeAlt + "m (사선 관통 착륙 오류 차단)\n\n" +
            "=======================================\n" +
            "목록 카드와 지도 상의 10m 공역 삼각기둥 볼륨이 무결합니까?\n" +
            "[확인]을 누른 뒤 [시뮬레이션 시작] 버튼을 한 번 더 누르면 비행이 격발됩니다.";

        window.gcsAutoNodesPreparedGuard = true;
        alert(totalWpBriefingMessage);
        return;
    }

    console.log("🚀 [GCS 마스터] 수직 이착륙 최적화 노선 자율 항행 스레드 격발!!");
    window.gcsAutoNodesPreparedGuard = false;

    var isGcsAltitudePickingError = false;
    list.forEach(function (node) {
        if (!node || !node.id) return;
        var testLon = parseFloat(node.lon);
        var testLat = parseFloat(node.lat);
        if (isNaN(testLon) || isNaN(testLat) || testLon === 0 || testLat === 0) {
            isGcsAltitudePickingError = true;
            return;
        }
        var baseFloor = parseFloat(node.roofBase);
        if (isNaN(baseFloor) || baseFloor <= 0) {
            isGcsAltitudePickingError = true;
            return;
        }

        if (node.id !== "Home" && node.id !== "Destination") {
            node.alt = finalCruiseSafeAlt;
        } else {
            node.alt = parseFloat(node.alt);
        }
        node.altitude_Z = node.alt;
    });

    if (isGcsAltitudePickingError === true) {
        window.isGcsDroneFlyingActive = false;
        if (window.gcsDroneLiveState) window.gcsDroneLiveState.currentStageString = "editing";
        scene.requestRender();
        return;
    }

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

    window.gcsLiveCurrentCruiseAltRef = finalCruiseSafeAlt;

    var homeCartesian = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeNode.alt);
    var _firstTargetRaw = (flightPathPoints.length > 0) ? flightPathPoints : destNodeObj;
    var firstTargetCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(_firstTargetRaw.lon), parseFloat(_firstTargetRaw.lat), parseFloat(_firstTargetRaw.alt));

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

    propertyPosition.addSample(startTime, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeNode.roofBase));
    propertyOrientation.addSample(startTime, qInitialNorth);
    timeSum += t_wait;

    var timeMotorReady = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(timeMotorReady, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeNode.roofBase));
    propertyOrientation.addSample(timeMotorReady, qInitialNorth);

    var climbSteps = 4;
    for (var step = 1; step <= climbSteps; step++) {
        var ratio = step / climbSteps;
        var t_interp = t_wait + (t_climb * ratio);
        var h_interp = homeNode.roofBase + ((homeNode.alt - homeNode.roofBase) * ratio);
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
    // 💥 순항 스레드 루프 (고속 액셀러레이터 적용 구역)
    for (var j = 0; j < flightPathPoints.length; j++) {
        var node = flightPathPoints[j]; if (!node) continue;
        timeSum += 4.0;
        var nodeTimeArrival = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        var exactWpCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(node.lon), parseFloat(node.lat), parseFloat(finalCruiseSafeAlt));
        propertyPosition.addSample(nodeTimeArrival, exactWpCartesian);
        propertyOrientation.addSample(nodeTimeArrival, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
        var startWpHoverTime = timeSum;
        timeSum += 1.0;
        var nodeTimeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        propertyPosition.addSample(nodeTimeHoverEnd, exactWpCartesian);
        propertyOrientation.addSample(nodeTimeHoverEnd, Cesium.Transforms.headingPitchRollQuaternion(exactWpCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
        window.gcsHoverScheduleTimestamps.push({ name: node.id, start: startWpHoverTime, end: timeSum });
    }
    // 💥 [복원 구역] : 최종 목적지 직상공(WP_AUTO_4) 진입 및 카드 연동 하강 착륙 시퀀스 완전 정합
    timeSum += 4.0;
    var destTopAirspaceTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    var destTopAirspaceCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), parseFloat(finalCruiseSafeAlt));
    propertyPosition.addSample(destTopAirspaceTime, destTopAirspaceCartesian);
    propertyOrientation.addSample(destTopAirspaceTime, Cesium.Transforms.headingPitchRollQuaternion(destTopAirspaceCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
    var destTopHoverStart = timeSum;
    timeSum += 3.0;
    var destTopHoverEndTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(destTopHoverEndTime, destTopAirspaceCartesian);
    propertyOrientation.addSample(destTopHoverEndTime, Cesium.Transforms.headingPitchRollQuaternion(destTopAirspaceCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
    window.gcsHoverScheduleTimestamps.push({ name: "Dest_Top_Hover", start: destTopHoverStart, end: timeSum });
    // 💥 [수직 하강 안착] : WP_AUTO_4 천장에서 목적지 카드에 정확히 연동된 최종 관제 고도(destNodeObj.alt = 177m 등) 축으로 수직 정밀 다운!
    timeSum += 5.0;
    var finalLandingTime = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    var finalLandingCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNodeObj.lon), parseFloat(destNodeObj.lat), parseFloat(destNodeObj.alt));
    propertyPosition.addSample(finalLandingTime, finalLandingCartesian);
    propertyOrientation.addSample(finalLandingTime, Cesium.Transforms.headingPitchRollQuaternion(finalLandingCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0)));
    window.gcsLiveTimeSumRef = timeSum;
    window.gcsSimulatedDroneEntity = mainViewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: finalLandingTime })]),
        position: propertyPosition,
        orientation: propertyOrientation,
        model: { uri: "data/drone.glb", scale: 0.15, minimumPixelSize: 35, maximumScale: 50, runAnimations: true },
        label: { text: "UAV 자율 항행 시동", font: 'bold 14px "Malgun Gothic", sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE, fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.CENTER, horizontalOrigin: Cesium.HorizontalOrigin.LEFT, pixelOffset: new Cesium.Cartesian2(40, 10), disableDepthTestDistance: Number.POSITIVE_INFINITY }
    });
    mainViewer.clock.startTime = startTime.clone();
    mainViewer.clock.stopTime = finalLandingTime.clone();
    mainViewer.clock.currentTime = startTime.clone();
    mainViewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
    mainViewer.clock.multiplier = 1.0;
    mainViewer.clock.shouldAnimate = true;
    window.gcsLiveEndTimeRef = finalLandingTime;
    var cameraStaticFixedPosition = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, homeNode.roofBase + 260.0);
    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    mainViewer.camera.setView({ destination: cameraStaticFixedPosition, orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 } });
    var gcsStopwatchStartTime = performance.now();
    if (window.gcsStopwatchIntervalId) clearInterval(window.gcsStopwatchIntervalId);
    window.gcsStopwatchIntervalId = setInterval(function () {
        var timeElement = document.getElementById("gcs_stopwatch_time_core");
        if (timeElement && !window.isGcsSimulationPaused) {
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
// 🛸 [GCS 코어 그래픽 엔진 - 공역 파이프라인 및 홈 삼각기둥 최종 사출기]
// =========================================================================
window.rebuildGcsPipelineAndLabels = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;
    if (window.gcsDroneLiveState && typeof window.gcsDroneLiveState.isTakeoffConfirmedGuard !== "undefined") {
        if (window.gcsDroneLiveState.isTakeoffConfirmedGuard === true || window.gcsDroneLiveState.isTakeoffConfirmedGuard === false) return;
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
        var basePoints = [];
        for (var a = 0; a < 360; a += 120) {
            var rad = Cesium.Math.toRadians(a);
            basePoints.push({ lon: nodeLon + (0.00004 * Math.cos(rad)), lat: nodeLat + (0.00004 * Math.sin(rad)) });
        }
        var trianglePosArray = [];
        basePoints.forEach(function (pt) { trianglePosArray.push(pt.lon, pt.lat); });
        window.GcsApp.state.gcsFireZoneEntities.push(
            mainViewer.entities.add({
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray(trianglePosArray),
                    height: buildingBaseHeight,
                    extrudedHeight: nodeAlt,
                    material: Cesium.Color.fromAlpha(nodeColor, 0.28),
                    outline: false,
                    perPositionHeight: false
                }
            })
        );
        basePoints.forEach(function (pt, idx) {
            var nextPt = basePoints[(idx + 1) % basePoints.length];
            window.GcsApp.state.gcsFireZoneEntities.push(
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, buildingBaseHeight)], width: 4.5, material: Cesium.Color.fromAlpha(nodeColor, 0.95), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } }),
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt), Cesium.Cartesian3.fromDegrees(nextPt.lon, nextPt.lat, nodeAlt)], width: 4.5, material: Cesium.Color.fromAlpha(nodeColor, 0.95), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } }),
                mainViewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, buildingBaseHeight), Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, nodeAlt)], width: 3.0, material: Cesium.Color.fromAlpha(nodeColor, 0.7), arcType: Cesium.ArcType.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
            );
        });
        window.GcsApp.state.gcsFireZoneEntities.push(
            mainViewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(nodeLon, nodeLat, nodeAlt + 12.0), label: { text: node.id + " (" + Math.round(nodeAlt) + "m)", font: 'bold 14px "Malgun Gothic", sans-serif', fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
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
// 🚩 [좌측 UI 카드 목록 리렌더러 - 텍스트 중복 완치본]
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
        var card = document.createElement("div");
        card.className = "gcs-waypoint-card" + (wp.id === "Home" ? " active" : "");
        card.id = "card_waypoint_" + wp.id;
        var themeColor = (wp.id === "Home") ? "#f1c40f" : (wp.id === "Destination") ? "#ef5350" : "#3498db";
        var borderStyle = "margin: 4px 0 6px 0; padding: 12px; background: rgba(30, 39, 46, 0.95); border-left: 4px solid " + themeColor + "; border-radius: 6px; box-sizing: border-box; color: #ffffff; text-align: left; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor: pointer; transition: 0.2s;";
        card.style.cssText = borderStyle;
        var cardTitle = wp.id === "Home" ? "🚩 출발지 (Home)" : (wp.id === "Destination" ? "🎯 목적지 (Destination)" : "🛸 경유지 (" + wp.id + ")");
        var deleteBtnHtml = (wp.id === "Home") ?
            `<span class="badge" style="font-size: 10px; background: #f1c40f; color: #000; padding: 2px 6px; border-radius: 3px; font-weight: bold;">관제 고정</span>` :
            `<button class="gcs-wp-delete-btn" style="background: #ef5350; border: none; color: #fff; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; z-index: 10;">삭제 X</button>`;
        var displayAddress = wp.address || (wp.id === "Home" ? "사용자 설정 락온 공역 출발지" : "자연 평지 공역");
        // 💥 [글씨 겹침 완전 박멸]: 하단 마크업 바인딩 단에서 2중으로 중복 출력되던 "관제 고도:" 텍스트 조각을 영구 소탕하고 1번만 깔끔하게 정합 완료!
        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"> <span style="font-weight: bold; color: ${themeColor}; font-size: 14px;">${cardTitle}</span> ${deleteBtnHtml} </div> <div style="font-size: 12px; color: #bdc3c7; line-height: 1.5; margin-bottom: 6px;"> <div style="font-weight: bold; color: #fff; margin-bottom: 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">지점: ${displayAddress}</div> <div style="display: flex; gap: 12px; font-family: monospace;"> <span>X: ${numLon.toFixed(6)}</span> <span>Y: ${numLat.toFixed(6)}</span> </div> </div> <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;"> <div style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #bdc3c7; white-space: nowrap;"> <span>${heightLabelText}:</span> <strong style="color: ${labelStyleColor}; font-size: 13px;">${finalCalculatedHeight}m</strong> </div> <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap;"> <span style="font-weight: bold; color: ${themeColor}; font-size: 12px;">관제 고도:</span> <div style="display: inline-flex; align-items: center; gap: 2px; background: #111; border: 1px solid ${themeColor}; border-radius: 3px; padding: 1px 3px;"> <button class="gcs-wp-alt-down-scroll" style="background:none; border:none; color:${themeColor}; cursor:pointer; font-weight:bold; font-size:12px; padding:0 5px;">▼</button> <input type="number" class="gcs-node-alt-dynamic-input" value="${absoluteControlAlt}" style="width: 45px; background: transparent; color: ${themeColor}; border: none; text-align: center; font-size: 11px; font-weight: bold; padding: 0;" readonly /> <button class="gcs-wp-alt-up-scroll" style="background:none; border:none; color:${themeColor}; cursor:pointer; font-weight:bold; font-size:12px; padding:0 5px;">▲</button> </div> <span style="color: ${themeColor}; font-weight: bold; font-size: 12px;">m</span> </div> </div>`;
        card.querySelector(".gcs-wp-alt-down-scroll").addEventListener("click", function (e) {
            e.stopPropagation();
            var inputEl = card.querySelector(".gcs-node-alt-dynamic-input");
            var currentVal = parseInt(inputEl.value, 10) || 150;
            var targetFloorMin = finalCalculatedHeight + 10;
            var nextVal = currentVal - 5;
            if (nextVal < targetFloorMin) nextVal = targetFloorMin;
            inputEl.value = nextVal;
            wp.alt = nextVal;
            wp.altitude_Z = nextVal;
            if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        });
        card.querySelector(".gcs-wp-alt-up-scroll").addEventListener("click", function (e) {
            e.stopPropagation();
            var inputEl = card.querySelector(".gcs-node-alt-dynamic-input");
            var currentVal = parseInt(inputEl.value, 10) || 150;
            var nextVal = currentVal + 5;
            if (nextVal > 1200) nextVal = 1200;
            inputEl.value = nextVal;
            wp.alt = nextVal;
            wp.altitude_Z = nextVal;
            if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
        });
        var delBtn = card.querySelector(".gcs-wp-delete-btn");
        if (delBtn) {
            delBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                var currentList = window.GcsApp.state.waypointList;
                var findIdx = currentList.findIndex(function (item) { return item.id === wp.id; });
                if (findIdx > -1) {
                    currentList.splice(findIdx, 1);
                    var cleanList = []; var wpCounter = 1;
                    currentList.forEach(function (node) {
                        if (!node) return;
                        if (node.id === "Home") cleanList.push(node);
                        else {
                            var finalId = node.id === "Destination" ? "Destination" : "WP_" + wpCounter++;
                            cleanList.push({ id: finalId, lon: node.lon, lat: node.lat, alt: node.alt, roofBase: node.roofBase, address: node.address, isBuilding: node.isBuilding });
                        }
                    });
                    window.GcsApp.state.waypointList = cleanList; window.waypointList = cleanList;
                    window.gcsAutoNodesPreparedGuard = false;
                    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
                    window.renderWaypointListUI();
                }
            });
        }
        card.addEventListener("click", function () {
            if (!mainViewer) return;
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(numLon, numLat - 0.0012, finalCalculatedHeight + 250),
                orientation: { heading: Cesium.Math.toRadians(0.0), pitch: Cesium.Math.toRadians(-40.0), roll: 0.0 },
                duration: 0.6
            });
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
window.exportMissionJSON = function () {
    var list = window.GcsApp.state.waypointList; if (list.length === 0) return;
    var d = list.map(function (w, i) { return { index: i + 1, id: w.id, longitude_X: parseFloat(w.lon.toFixed(6)), latitude_Y: parseFloat(w.lat.toFixed(6)), altitude_Z: parseFloat(w.alt.toFixed(1)) }; });
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gcs_mission.json"; a.click();
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
window.closeGcsHudPanelWithLayoutRestore = function () {
    var hudContainer = document.getElementById("gcs_internal_hud_container") || document.querySelector('.gcs-hud-panel') || document.getElementById("hud");
    if (!hudContainer) return; if (window.isGcsLayoutSwapped) window.switchGcsMainWindowAndHud();
    hudContainer.style.display = "none";
    var chk = document.getElementById("gcs_hud_use_toggle") || document.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = false;
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
window.gcsInitializeDestAltControls = function () {
    var list = window.GcsApp?.state?.waypointList || window.waypointList || []; if (!Array.isArray(list) || list.length === 0) return;
    var destCard = document.getElementById("card_waypoint_Destination");
    if (destCard) {
        var inputContainer = destCard.querySelector(".gcs-node-alt-dynamic-input")?.parentNode;
        if (inputContainer && !document.getElementById("gcs_dest_alt_live_input")) {
            var lastNode = list[list.length - 1];
            inputContainer.innerHTML = `<span style="font-weight: bold; color: #ef5350; font-size: 11px;">관제 고도:</span><div style="display: inline-flex; align-items: center; gap: 2px; background: #111; border: 1px solid #ef5350; border-radius: 3px; padding: 1px 3px;"><button id="gcs_dest_alt_down" style="background:none; border:none; color:#ef5350; cursor:pointer; font-weight:bold; font-size:12px; padding:0 4px;">▼</button><input type="number" id="gcs_dest_alt_live_input" value="${Math.round(lastNode.alt || 150)}" style="width: 45px; background: transparent; color: #ef5350; border: none; text-align: center; font-size: 11px; font-weight: bold; -moz-appearance: textfield;" readonly /><button id="gcs_dest_alt_up" style="background:none; border:none; color:#ef5350; cursor:pointer; font-weight:bold; font-size:12px; padding:0 4px;">▲</button></div><span style="color: #ef5350; font-weight: bold; font-size: 11px;">m</span>`;
            document.getElementById("gcs_dest_alt_up").addEventListener("click", function (e) { e.stopPropagation(); var currentAlt = parseInt(document.getElementById("gcs_dest_alt_live_input").value, 10) || 150; window.gcsUpdateDestinationAltitudeLive(currentAlt + 5); });
            document.getElementById("gcs_dest_alt_down").addEventListener("click", function (e) { e.stopPropagation(); var currentAlt = parseInt(document.getElementById("gcs_dest_alt_live_input").value, 10) || 150; window.gcsUpdateDestinationAltitudeLive(currentAlt - 5); });
        }
    }
};
var secureDestinationArrivalTracker = setInterval(function () { if (window.gcsDroneLiveState && window.gcsDroneLiveState.currentStageString === "landing_done") { window.gcsInitializeDestAltControls(); } }, 500);
window.gcsUpdateDestinationAltitudeLive = function (newAltitude) {
    var list = window.GcsApp?.state?.waypointList || window.waypointList || []; if (!Array.isArray(list) || list.length === 0) return;
    var destNode = list[list.length - 1]; if (!destNode || destNode.id !== "Destination") return;
    var baseFloorHeight = parseFloat(destNode.roofBase) || 0;
    if (baseFloorHeight === 0 && ws3d.viewer.scene.globe) { baseFloorHeight = ws3d.viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(destNode.lon, destNode.lat)) || 86; }
    baseFloorHeight = Math.round(baseFloorHeight);
    if (newAltitude < baseFloorHeight + 15) { newAltitude = baseFloorHeight + 15; }
    if (newAltitude > 1200) newAltitude = 1200;
    var destAltInput = document.getElementById("gcs_dest_alt_live_input"); if (destAltInput) destAltInput.value = Math.round(newAltitude);
    destNode.alt = newAltitude; destNode.altitude_Z = newAltitude; window.gcsIsSubsequentFlightActive = true;
    var backupStage = window.gcsDroneLiveState?.currentStageString; if (window.gcsDroneLiveState) window.gcsDroneLiveState.currentStageString = "editing_mode_override";
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();
    if (window.gcsDroneLiveState) window.gcsDroneLiveState.currentStageString = backupStage;
    ws3d.viewer.scene.requestRender();
};
(function clearAllGcsOldOptimizationResidualIntervals() {
    window.gcsUserManualAltOverrideLock = true;
    for (var i = 1; i < 9999; i++) { if (window.gcsStopwatchIntervalId && i === window.gcsStopwatchIntervalId) continue; clearInterval(i); }
    if (window.gcsArchiveIntervalId) { clearInterval(window.gcsArchiveIntervalId); window.gcsArchiveIntervalId = null; }
    window.gcsArchiveIntervalId = setInterval(function () {
        var list = window.GcsApp?.state?.waypointList || window.waypointList || []; if (!Array.isArray(list) || list.length === 0) return;
        var cStage = (window.gcsDroneLiveState) ? window.gcsDroneLiveState.currentStageString : "editing";
        if (cStage === "takeoff_ready" || cStage === "takeoff_climb" || cStage === "takeoff_hover" || cStage === "cruise" || window.gcsSimulatedDroneEntity) return;
        window.gcsUserManualAltOverrideLock = true;
    }, 100);
})();
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