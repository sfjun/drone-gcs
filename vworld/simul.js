// =========================================================================
// 🛸 [simul.js 최종 완성 통합 마스터 - 파트 1: 자율비행 제어 및 타임라인 엔진]
// =========================================================================

if (!window.gcsMissionNodes) {
    window.gcsMissionNodes = { home: null, waypoints: [], destination: null };
}
window.gcsSimulatedDroneEntity = null;
window.gcsMultiCamRenderListener = null;

window.gcsLiveDroneCamMetrics = { 
    lon: 0, lat: 0, alt: 0, heading: 0,
    currentStage: "takeoff", statusText: "대기중"
};

/**
 * 🎬 드론 자율비행 시뮬레이션 스타터 (독립 관제 채널 및 고도 동기화 패치 완료)
 */
window.startGcsDroneSimulation = function() {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
        console.warn("⚠️ 세슘 지도 엔진이 로드되지 않아 시뮬레이션을 시작할 수 없습니다.");
        return;
    }
    var mainViewer = ws3d.viewer;

    if (!window.waypointList || window.waypointList.length < 2) {
        alert("⚠️ [시뮬레이션 불가] 출발지(Home)와 최종 목적지(Destination)가 모두 완비되어야 자율비행 기동이 가능합니다.");
        return;
    }

    var popupCheck = document.getElementById("gcs_popup_video_checkbox");
    var isPopupEnabled = popupCheck ? popupCheck.checked : true;

    // 상단 중간의 기존 고정 전광판 요소 완전 제거 (드론 레이블로 대체)
    var oldBoard = document.getElementById("gcs_live_telemetry_top_board");
    if (oldBoard) oldBoard.parentNode.removeChild(oldBoard);

    var homeNode = window.waypointList[0];
    var destNode = window.waypointList[window.waypointList.length - 1];
    var flightPathPoints = window.waypointList.slice(1); 

    if (typeof window.stopGcsDroneSimulation === "function") {
        window.stopGcsDroneSimulation();
    }

    // 🎯 [메인 시점 유지] 시뮬레이션 중 사용자의 휠 제어권을 보장하기 위해 시작할 때의 초기 시점을 백업
    var frozenCameraPosition = mainViewer.camera.position.clone();
    var frozenCameraHeading = mainViewer.camera.heading;
    var frozenCameraPitch = mainViewer.camera.pitch;
    var frozenCameraRoll = mainViewer.camera.roll;

    // 🎯 [경로선 일치화] 타일 고도 오차를 생략하고 0m 절대 해발고도 기준으로 에어돔 바닥면과 정밀 싱크
    buildAndRunDroneTimeline(0.0);

    function buildAndRunDroneTimeline(baseElevation) {
        var propertyPosition = new Cesium.SampledPositionProperty();
        var propertyOrientation = new Cesium.SampledProperty(Cesium.Quaternion);
        
        var startTime = Cesium.JulianDate.now();
        var timeSum = 0;

        // 🎯 [출발 고도 개조] 최초 대기 고도를 삼각기둥 꼭대기가 아닌 바닥면(0m 지면)에서 수직 이륙 시동
        var startTerrainAlt = baseElevation; 
        var takeoffAlt = baseElevation + homeNode.alt;
        
        var firstTargetNode = flightPathPoints[0] || destNode;
        var homeCartesian = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, takeoffAlt);
        var firstTargetCartesian = Cesium.Cartesian3.fromDegrees(firstTargetNode.lon, firstTargetNode.lat, baseElevation + firstTargetNode.alt);
        
        var enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(homeCartesian);
        var invEnuTransform = Cesium.Matrix4.inverse(enuTransform, new Cesium.Matrix4());
        var localTargetPos = Cesium.Matrix4.multiplyByPoint(invEnuTransform, firstTargetCartesian, new Cesium.Cartesian3());
        
        var targetHeadingRadian = Math.atan2(localTargetPos.x, localTargetPos.y); 

        var t_wait = 2.0;       
        var t_takeoff = 7.0;    
        var t_hover = 10.0;     

        var time0 = Cesium.JulianDate.addSeconds(startTime, 0, new Cesium.JulianDate());
        propertyPosition.addSample(time0, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, startTerrainAlt));
        var qInitial = Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(targetHeadingRadian - Cesium.Math.toRadians(180.0), 0.0, 0.0));
        propertyOrientation.addSample(time0, qInitial);

        var time2 = Cesium.JulianDate.addSeconds(startTime, t_wait, new Cesium.JulianDate());
        propertyPosition.addSample(time2, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, startTerrainAlt));
        propertyOrientation.addSample(time2, qInitial);

        var time7 = Cesium.JulianDate.addSeconds(startTime, t_takeoff, new Cesium.JulianDate());
        propertyPosition.addSample(time7, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, takeoffAlt));
        propertyOrientation.addSample(time7, qInitial);

        var time10 = Cesium.JulianDate.addSeconds(startTime, t_hover, new Cesium.JulianDate());
        propertyPosition.addSample(time10, Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, takeoffAlt));
        propertyOrientation.addSample(time10, qInitial);

        timeSum = t_hover;
        var currentHeading = targetHeadingRadian;
        window.gcsHoverScheduleTimestamps = [];

        for (var j = 0; j < flightPathPoints.length; j++) {
            var node = flightPathPoints[j];
            var cruiseAlt = baseElevation + node.alt;
            var isDest = (j === flightPathPoints.length - 1);
            
            timeSum += 6;
            var nodeTimeArrival = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
            var nodeCartesian = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, cruiseAlt);
            propertyPosition.addSample(nodeTimeArrival, nodeCartesian);
            
            var qFlight = Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(currentHeading - Cesium.Math.toRadians(180.0), 0.0, 0.0));
            propertyOrientation.addSample(nodeTimeArrival, qFlight);

            if (!isDest) {
                var startHoverTime = timeSum;
                timeSum += 3; 
                var nodeTimeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
                propertyPosition.addSample(nodeTimeHoverEnd, nodeCartesian);

                var nextNode = flightPathPoints[j + 1];
                var nextCartesian = Cesium.Cartesian3.fromDegrees(nextNode.lon, nextNode.lat, baseElevation + nextNode.alt);
                var nextTransform = Cesium.Transforms.eastNorthUpToFixedFrame(nodeCartesian);
                var invNextTransform = Cesium.Matrix4.inverse(nextTransform, new Cesium.Matrix4());
                var localNextPos = Cesium.Matrix4.multiplyByPoint(invNextTransform, nextCartesian, new Cesium.Cartesian3());
                currentHeading = Math.atan2(localNextPos.x, localNextPos.y);

                var qNextTurn = Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(currentHeading - Cesium.Math.toRadians(180.0), 0.0, 0.0));
                propertyOrientation.addSample(nodeTimeHoverEnd, qNextTurn);
                
                window.gcsHoverScheduleTimestamps.push({ name: node.id, start: startHoverTime, end: timeSum });
            }
        }

        var t_cruise_end = timeSum;

        timeSum += 5;
        var timeFinal = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        propertyPosition.addSample(timeFinal, Cesium.Cartesian3.fromDegrees(destNode.lon, destNode.lat, baseElevation + destNode.alt));
        var qFinalFixed = Cesium.Quaternion.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(currentHeading - Cesium.Math.toRadians(180.0), 0.0, 0.0));
        propertyOrientation.addSample(timeFinal, qFinalFixed);

        // 🌟 [추적형 토스트 레이블] 드론 기체 우측에 동적으로 부착되는 인라인 안내창 속성 정의
        window.gcsSimulatedDroneEntity = mainViewer.entities.add({
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: timeFinal })]),
            position: propertyPosition,
            orientation: propertyOrientation, 
            model: { uri: 'data/drone.glb', scale: 2.2, minimumPixelSize: 45, maximumScale: 60, runAnimations: true },
            label: {
                text: "🛸 대기중", font: 'bold 14px "Malgun Gothic", sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE, fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
                verticalOrigin: Cesium.VerticalOrigin.CENTER, horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                pixelOffset: new Cesium.Cartesian2(35, 0), disableDepthTestDistance: Number.POSITIVE_INFINITY 
            },
            path: { resolution: 1, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.35, color: Cesium.Color.DEEPPINK }), width: 5, leadTime: 0, trailTime: 180 }
        });

        mainViewer.clock.startTime = startTime.clone();
        mainViewer.clock.stopTime = timeFinal.clone();
        mainViewer.clock.currentTime = startTime.clone();
        mainViewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
        mainViewer.clock.multiplier = 0.4; 

        // 🎯 [메인 지도 조작 해제] 프레임 반복 시 구속을 풀어서 사용자의 지도 이동/확축을 전면 자유 보장
        mainViewer.trackedEntity = undefined; 
        mainViewer.camera.setView({
            destination: frozenCameraPosition,
            orientation: { heading: frozenCameraHeading, pitch: frozenCameraPitch, roll: frozenCameraRoll }
        });

        mainViewer.clock.shouldAnimate = false;
        setTimeout(function() { 
            mainViewer.clock.shouldAnimate = true; 
            if (mainViewer.scene && mainViewer.scene.requestRender) { mainViewer.scene.requestRender(); }
            if (isPopupEnabled && typeof window.gcsOpenThreeChannelSubVideoHUD === "function") {
                window.gcsOpenThreeChannelSubVideoHUD();
            }
        }, 350);

                // =========================================================================
        // 🔄 [전면 개조] 에러 소멸 및 메인지도 자유 조작 독립 HUD 렌더 리스너
        // =========================================================================
        window.gcsMultiCamRenderListener = function() {
            if (!window.gcsSimulatedDroneEntity) return;

            var currentTime = mainViewer.clock.currentTime;
            var droneCartesian = window.gcsSimulatedDroneEntity.position.getValue(currentTime);
            if (!Cesium.defined(droneCartesian)) return;

            var droneCarto = Cesium.Cartographic.fromCartesian(droneCartesian);
            var lon = Cesium.Math.toDegrees(droneCarto.longitude);
            var lat = Cesium.Math.toDegrees(droneCarto.latitude);
            var alt = droneCarto.height;

            var elapsed = Cesium.JulianDate.secondsDifference(currentTime, startTime);
            var stage = "takeoff";
            var statusStr = "대기중";
            // 🎯 [오타 완치] Cesium.Color 규격을 사용하여 GREENYELLOW 참조 에러를 완벽히 차단했습니다.
            var labelColor = Cesium.Color.LIGHTGRAY;

            if (elapsed <= t_wait) { 
                stage = "takeoff"; statusStr = "⏸️ 대기중"; labelColor = Cesium.Color.LIGHTGRAY; 
            } else if (elapsed > t_wait && elapsed <= t_takeoff) { 
                stage = "takeoff"; statusStr = "🚀 이륙중 (" + Math.round(alt) + "m)"; labelColor = Cesium.Color.ORANGE; 
            } else if (elapsed > t_takeoff && elapsed <= t_hover) { 
                stage = "takeoff"; statusStr = "🔄 방향 선회 호버링"; labelColor = Cesium.Color.MEDIUMSPRINGGREEN; 
            } else if (elapsed > t_hover && elapsed <= t_cruise_end) {
                stage = "cruise"; statusStr = "🛸 임무 순항 비행중"; labelColor = Cesium.Color.CYAN;
                if (window.gcsHoverScheduleTimestamps) {
                    for (var k = 0; k < window.gcsHoverScheduleTimestamps.length; k++) {
                        var sch = window.gcsHoverScheduleTimestamps[k];
                        if (elapsed >= sch.start && elapsed <= sch.end) { 
                            statusStr = "📍 " + sch.name + " 제자리 호버링 및 선회중"; labelColor = Cesium.Color.YELLOW; break; 
                        }
                    }
                }
            } else { 
                stage = "land"; statusStr = "📸 목적지 임무완수 및 안착중"; labelColor = Cesium.Color.GREENYELLOW; 
            }

            // 드론 옆 추적 토스트 문구 갱신
            if (window.gcsSimulatedDroneEntity.label) {
                window.gcsSimulatedDroneEntity.label.text = statusStr;
                window.gcsSimulatedDroneEntity.label.fillColor = labelColor;
            }

            var currentDroneHeading = currentHeading;
            var lookAheadTime = Cesium.JulianDate.addSeconds(currentTime, 0.1, new Cesium.JulianDate());
            var nextCartesian = window.gcsSimulatedDroneEntity.position.getValue(lookAheadTime);
            if (Cesium.defined(nextCartesian)) {
                var nextCarto = Cesium.Cartographic.fromCartesian(nextCartesian);
                var dLon = nextCarto.longitude - droneCarto.longitude;
                var dLat = nextCarto.latitude - droneCarto.latitude;
                if (dLon !== 0 || dLat !== 0) { currentDroneHeading = Math.atan2(dLon, dLat); }
            }

            window.gcsLiveDroneCamMetrics.lon = lon;
            window.gcsLiveDroneCamMetrics.lat = lat;
            window.gcsLiveDroneCamMetrics.alt = alt;
            window.gcsLiveDroneCamMetrics.currentStage = stage;
            window.gcsLiveDroneCamMetrics.droneHeading = currentDroneHeading;

            // 🎯 메인 지도를 강제로 튕기지 않고, 팝업창 인터페이스로 단계별 비행 벡터 상태값만 즉시 송출
            if (isPopupEnabled && window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
                if (typeof window.gcsExternalMonitorWindow.gcsRefreshHUDVideoFrame === "function") {
                    window.gcsExternalMonitorWindow.gcsRefreshHUDVideoFrame(stage, currentDroneHeading, alt, statusStr);
                }
            }
        };
        mainViewer.scene.postRender.addEventListener(window.gcsMultiCamRenderListener);
    }
};

// =========================================================================
// 🚀 [HUD 관측 팝업] 독립 자이로 영상 변환 및 정향 직사 뷰 연출 엔진
// =========================================================================
window.gcsExternalMonitorWindow = null;

window.gcsOpenThreeChannelSubVideoHUD = function() {
    if (window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
        window.gcsExternalMonitorWindow.close();
    }

    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var mainCanvas = mainViewer.scene.canvas;
    if (!mainCanvas) return;

    var captureStream = mainCanvas.captureStream ? mainCanvas.captureStream(30) : mainCanvas.mozCaptureStream(30);

    var popupLeft = window.screen.width - 540; 
    window.gcsExternalMonitorWindow = window.open("", "GCS_Single_Auto_HUD", "width=480,height=420,left=" + popupLeft + ",top=100,resizable=yes,scrollbars=no,status=no,alwaysRaised=yes");

    if (!window.gcsExternalMonitorWindow) return;

    var popupDoc = window.gcsExternalMonitorWindow.document;
    popupDoc.open();
    popupDoc.write('<!DOCTYPE html><html><head><title>🛸 GCS 스마트 미션 라이브 HUD</title></head><body></body></html>');
    popupDoc.close();

    var popupBody = popupDoc.body;
    var cssStyle = popupDoc.createElement("style");
    cssStyle.textContent = 
        'body { margin: 0; padding: 12px; background: #070d19; color: #fff; font-family: "Malgun Gothic", sans-serif; overflow: hidden; }' +
        '.cam-panel { width: 100%; height: calc(100% - 4px); background: #0b1320; border: 3px solid #ff9f43; border-radius: 8px; position: relative; overflow: hidden; box-shadow: 0 6px 25px rgba(0,0,0,0.6); display: flex; flex-direction: column; }' +
        '.title-bar { font-size: 13px; font-weight: bold; padding: 8px 12px; display: flex; justify-content: space-between; border-bottom: 2px solid rgba(255,255,255,0.15); background: #d35400; transition: background-color 0.3s ease; }' +
        '.video-area { flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }' +
        'video { width: 100%; height: 100%; object-fit: cover; transform-origin: center center; transition: transform 0.2s ease-out; position: absolute; }' + 
        '.hud-overlay { position: absolute; top: 15px; left: 15px; background: rgba(0, 0, 0, 0.65); padding: 8px 12px; border-radius: 4px; border-left: 4px solid #54a0ff; font-size: 12px; line-height: 1.6; z-index: 10; pointer-events: none; }' +
        '@keyframes blink { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }';
    popupDoc.head.appendChild(cssStyle);

    var camPanel = popupDoc.createElement("div");
    camPanel.className = "cam-panel";
    camPanel.id = "gcs_main_hud_panel";

    var titleBar = popupDoc.createElement("div");
    titleBar.className = "title-bar";
    titleBar.id = "gcs_hud_title_bar";

    var modeText = popupDoc.createElement("span");
    modeText.id = "gcs_hud_mode_text";
    modeText.textContent = "📸 [수직 이륙 단계] 기체 위 조감 하방 뷰 (Top-Down)";
    titleBar.appendChild(modeText);

    var liveDot = popupDoc.createElement("span");
    liveDot.style.color = "#ff4757";
    liveDot.style.animation = "blink 1s infinite";
    liveDot.textContent = "● 라이브 HUD";
    titleBar.appendChild(liveDot);
    camPanel.appendChild(titleBar);

    var videoArea = popupDoc.createElement("div");
    videoArea.className = "video-area";
    
    // 실시간 비행 상태 오버레이 인덱스 장착
    var hudOverlay = popupDoc.createElement("div");
    hudOverlay.className = "hud-overlay";
    hudOverlay.id = "gcs_hud_overlay_metrics";
    hudOverlay.innerHTML = "✈️ 텔레메트리 연결중...<br>📊 현재 고도: 0m";
    videoArea.appendChild(hudOverlay);

    var videoEl = popupDoc.createElement("video");
    videoEl.id = "gcs_hud_video";
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoArea.appendChild(videoEl);
    camPanel.appendChild(videoArea);
    popupBody.appendChild(camPanel);

    videoEl.srcObject = captureStream;

    // 🌟 [완치 행렬식] 오타 제거 및 단계별 1인칭 전방 배율 크롭 화각 연산 자동 갱신
    var runScript = popupDoc.createElement("script");
    runScript.textContent = 
        'var videoEl = document.getElementById("gcs_hud_video");' +
        'var titleBar = document.getElementById("gcs_hud_title_bar");' +
        'var modeText = document.getElementById("gcs_hud_mode_text");' +
        'var panelFrame = document.getElementById("gcs_main_hud_panel");' +
        'var overlayMetrics = document.getElementById("gcs_hud_overlay_metrics");' +
        'window.gcsRefreshHUDVideoFrame = function(stage, droneHeading, currentAlt, statusStr) {' +
        '    var deg = Math.round(droneHeading * (180 / Math.PI)) || 0;' + 
        '    overlayMetrics.innerHTML = "📡 상태: " + statusStr + "<br>📈 비행 고도: " + Math.round(currentAlt) + " m<br>🧭 조향 방향각: " + deg + "°";' +
        '    if (stage === "takeoff") {' +
        '        titleBar.style.backgroundColor = "#d35400";' +
        '        panelFrame.style.borderColor = "#ff9f43";' +
        '        modeText.textContent = "📸 [수직 이륙 단계] 기체 위 조감 정수직 하방 뷰";' + 
        '        /* 🎯 정수직 하방 직사 뷰 고정 연산 */' +
        '        videoEl.style.transform = "scale(1.4) rotate(0deg) translateY(0px)";' + 
        '    } else if (stage === "cruise") { ' +
        '        titleBar.style.backgroundColor = "#2980b9";' +
        '        panelFrame.style.borderColor = "#54a0ff";' +
        '        modeText.textContent = "🛸 [자율 순항 단계] 드론 메인 전방 1인칭 관제 시야";' + 
        '        /* 🎯 1인칭 전방 뷰 자동 전환 및 원거리 확대 크롭 정합 */' +
        '        videoEl.style.transform = "scale(2.8) rotate(0deg) translateY(45px)";' + 
        '    } else if (stage === "land") {' +
'        titleBar.style.backgroundColor = "#27ae60";' +
'        panelFrame.style.borderColor = "#2ecc71";' +
'        modeText.textContent = "📸 [도착 착륙 단계] 기체 위 조감 정수직 하방 안착 뷰";' +
'        videoEl.style.transform = "scale(1.4) rotate(0deg) translateY(0px)";' +
'    }' +
'};';
popupDoc.body.appendChild(runScript);
};
window.stopGcsDroneSimulation = function() {
if (window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
window.gcsExternalMonitorWindow.close();
}
if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
if (window.gcsMultiCamRenderListener) {
ws3d.viewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener);
window.gcsMultiCamRenderListener = null;
}
if (window.gcsSimulatedDroneEntity) {
ws3d.viewer.entities.remove(window.gcsSimulatedDroneEntity);
window.gcsSimulatedDroneEntity = null;
}
}
};
/**
• 🎯 [삼각기둥 에어돔 수립 파트]
*/
window.triggerGcsCommand = function(actionType) {
if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
var viewer = ws3d.viewer;var rawCameraHeight = Math.round(viewer.camera.positionCartographic.height);
if (isNaN(rawCameraHeight) || rawCameraHeight <= 0) rawCameraHeight = 300;var halvedGcsHeight = Math.round(rawCameraHeight * 0.5);var altInput = document.getElementById("adaptive_alt_input") || document.querySelector("input[type='number']");
if (altInput) {
altInput.value = halvedGcsHeight;
var nextNode = altInput.nextSibling;
while (nextNode) {
if (nextNode.nodeType === 3) { nextNode.textContent = " m"; break; }
nextNode = nextNode.nextSibling;
}
}var numLon = parseFloat(window.gcsLastRightClickLon);
var numLat = parseFloat(window.gcsLastRightClickLat);
if (isNaN(numLon) || isNaN(numLat) || numLon === 0) return;if (!window.waypointList) window.waypointList = [];if (actionType === "home") {
var homeData = { id: "Home", lon: numLon, lat: numLat, alt: halvedGcsHeight };
if (window.waypointList.length > 0 && window.waypointList[0].id === "Home") {
window.waypointList[0] = homeData;
} else {
window.waypointList.unshift(homeData);
}
} else if (actionType === "destination") {
var destData = { id: "Destination", lon: numLon, lat: numLat, alt: halvedGcsHeight };
if (window.waypointList.length > 0 && window.waypointList[window.waypointList.length - 1].id === "Destination") {
window.waypointList[window.waypointList.length - 1] = destData;
} else {
window.waypointList.push(destData);
}
} else if (actionType === "waypoint") {
var wpIndex = window.waypointList.length;
if (window.waypointList.length > 0 && window.waypointList[window.waypointList.length - 1].id === "Destination") {
wpIndex = window.waypointList.length - 1;
}
var wpData = { id: "WP_TEMP", lon: numLon, lat: numLat, alt: halvedGcsHeight };
window.waypointList.splice(wpIndex, 0, wpData);
}var cleanList = [];
var wpCounter = 1;
window.waypointList.forEach(function(wp, idx) {
let cleanLabel = "WP_" + wpCounter;
if (idx === 0) {
cleanLabel = "Home";
} else if (idx === window.waypointList.length - 1 && window.waypointList.length > 1 && wp.id === "Destination") {
cleanLabel = "Destination";
} else {
cleanLabel = "WP_" + wpCounter;
wpCounter++;
}
var itemNode = { id: cleanLabel, lon: wp.lon, lat: wp.lat, alt: wp.alt };
cleanList.push(itemNode);
});
window.waypointList = cleanList;
window.rebuildGcsPipelineAndLabels();
};
window.rebuildGcsPipelineAndLabels = function() {
if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
var viewer = ws3d.viewer;
if (window.gcsFireZoneEntities && window.gcsFireZoneEntities.length > 0) {
window.gcsFireZoneEntities.forEach(function(entity) { viewer.entities.remove(entity); });
}
window.gcsFireZoneEntities = [];
var pipeLinePositions = [];
window.waypointList.forEach(function(node) {
var nodeAlt = parseFloat(node.alt) || 150.0;
var upperAirCartesian = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt);
pipeLinePositions.push(upperAirCartesian);
var nodeColor = Cesium.Color.CYAN;
if (node.id === "Home") nodeColor = Cesium.Color.DARKORANGE;
else if (node.id === "Destination") nodeColor = Cesium.Color.RED;
var degreesRadius = 0.00025;
var triangleDegreesPositions = [];
for (var a = 0; a < 360; a += 120) {
var rad = Cesium.Math.toRadians(a);
var tLon = node.lon + (degreesRadius * Math.cos(rad));
var tLat = node.lat + (degreesRadius * Math.sin(rad));
triangleDegreesPositions.push(tLon, tLat);
}
var triangularAirDome = viewer.entities.add({
polygon: {
hierarchy: Cesium.Cartesian3.fromDegreesArray(triangleDegreesPositions),
height: 0.0,
extrudedHeight: nodeAlt,
material: nodeColor.withAlpha(0.32),
outline: true, outlineColor: nodeColor.withAlpha(0.6), outlineWidth: 3,
disableDepthTestDistance: false
}
});
window.gcsFireZoneEntities.push(triangularAirDome);
var labelEntity = viewer.entities.add({
position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, nodeAlt + 15.0),
label: {
text: node.id + " (" + Math.round(nodeAlt) + "m)",
font: 'bold 13px "Malgun Gothic", sans-serif',
fillColor: nodeColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
style: Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
disableDepthTestDistance: Number.POSITIVE_INFINITY
}
});
window.gcsFireZoneEntities.push(labelEntity);
});
if (pipeLinePositions.length > 1) {
var masterFibreLaserLine = viewer.entities.add({
polyline: {
positions: pipeLinePositions,
width: 5,
material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.SPRINGGREEN }),
arcType: Cesium.ArcType.NONE
}
});
window.gcsFireZoneEntities.push(masterFibreLaserLine);
}
if (typeof window.renderWaypointListUI === "function") {
window.renderWaypointListUI();
}
};
window.updateHeightFromInput = function (id, newHeight) {
let wp = window.waypointList.find(w => w.id === id);
if (wp) {
wp.alt = parseFloat(newHeight) || 150.0;
if (typeof window.rebuildGcsPipelineAndLabels === "function") {
window.rebuildGcsPipelineAndLabels();
}
}
};
window.deleteWaypoint = function (id) {
window.waypointList = window.waypointList.filter(w => w.id !== id);
var cleanList = [];
var wpCounter = 1;
window.waypointList.forEach(function(wp, idx) {
let cleanLabel = "WP_" + wpCounter;
if (idx === 0) cleanLabel = "Home";
else if (idx === window.waypointList.length - 1 && window.waypointList.length > 1) cleanLabel = "Destination";
else wpCounter++;
cleanList.push({ id: cleanLabel, lon: wp.lon, lat: wp.lat, alt: parseFloat(wp.alt) || 150.0 });
});
window.waypointList = cleanList;
if (typeof window.rebuildGcsPipelineAndLabels === "function") {
window.rebuildGcsPipelineAndLabels();
}
};
window.executeGcsNodeInjection = function(lon, lat, alt, nameText) {
console.log("🟢 [GCS 인터페이스] 3D 월 파이프 격리형 연동 인프라 정착 마감");
};