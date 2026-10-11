// =========================================================================
// 🛸 [simul.js 최종 완성 마스터 - 파트 1: 설계 시점 카메라 각도/고도 박제 고정 엔진]
// =========================================================================

if (!window.gcsMissionNodes) {
    window.gcsMissionNodes = { home: null, waypoints: [], destination: null };
}
window.gcsSimulatedDroneEntity = null;
window.gcsMultiCamRenderListener = null;

// [안전 보장] WebGL 컨텍스트와 독립 격리된 초경량 데이터 브릿지 저장소
window.gcsLiveDroneCamMetrics = { 
    lon: 0, lat: 0, alt: 0, heading: 0,
    currentStage: "takeoff",
    statusText: "대기중"
};

/**
 * 🎬 드론 자율비행 시뮬레이션 스타터 (체크박스 동적 제어 스위칭 가드 버전)
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

    // 🎯 팝업영상 체크박스 상태 판독 (HTML의 id="gcs_popup_video_checkbox"와 안전 연동)
    var popupCheck = document.getElementById("gcs_popup_video_checkbox");
    var isPopupEnabled = popupCheck ? popupCheck.checked : true;

    // 상단 상태 안내 전광판 돔(DOM) 개설 가동 (안전 주입)
    window.gcsBuildLiveStatusDashboardUI();

    var homeNode = window.waypointList[0];
    var destNode = window.waypointList[window.waypointList.length - 1];
    var flightPathPoints = window.waypointList.slice(1); 

    if (typeof window.stopGcsDroneSimulation === "function") {
        window.stopGcsDroneSimulation();
    }

    var frozenCameraPosition = mainViewer.camera.position.clone();
    var frozenCameraHeading = mainViewer.camera.heading;
    var frozenCameraPitch = mainViewer.camera.pitch;
    var frozenCameraRoll = mainViewer.camera.roll;

    var terrainProvider = mainViewer.terrainProvider;
    var homePositionCartographic = Cesium.Cartographic.fromDegrees(homeNode.lon, homeNode.lat);
    var groundElevation = 35.0; 

    Cesium.sampleTerrainMostDetailed(terrainProvider, [homePositionCartographic])
        .then(function(samples) {
            if (samples && samples.height !== undefined) {
                groundElevation = samples.height;
            }
            buildAndRunDroneTimeline(groundElevation);
        })
        .catch(function(error) {
            buildAndRunDroneTimeline(groundElevation);
        });

    function buildAndRunDroneTimeline(baseElevation) {
        var propertyPosition = new Cesium.SampledPositionProperty();
        var propertyOrientation = new Cesium.SampledProperty(Cesium.Quaternion);
        
        var startTime = Cesium.JulianDate.now();
        var timeSum = 0;

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

        window.gcsSimulatedDroneEntity = mainViewer.entities.add({
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: timeFinal })]),
            position: propertyPosition,
            orientation: propertyOrientation, 
            model: {
                uri: 'data/drone.glb', 
                scale: 2.2,                       
                minimumPixelSize: 45,             
                maximumScale: 60,                
                runAnimations: true 
            },
            path: { resolution: 1, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.35, color: Cesium.Color.DEEPPINK }), width: 5, leadTime: 0, trailTime: 180 }
        });

        mainViewer.clock.startTime = startTime.clone();
        mainViewer.clock.stopTime = timeFinal.clone();
        mainViewer.clock.currentTime = startTime.clone();
        mainViewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
        mainViewer.clock.multiplier = 0.4; 

        mainViewer.trackedEntity = undefined; 
        mainViewer.camera.setView({
            destination: frozenCameraPosition,
            orientation: { heading: frozenCameraHeading, pitch: frozenCameraPitch, roll: frozenCameraRoll }
        });

        mainViewer.clock.shouldAnimate = false;
        setTimeout(function() { 
            mainViewer.clock.shouldAnimate = true; 
            if (mainViewer.scene && mainViewer.scene.requestRender) {
                mainViewer.scene.requestRender();
            }
            if (isPopupEnabled && typeof window.gcsOpenThreeChannelSubVideoHUD === "function") {
                window.gcsOpenThreeChannelSubVideoHUD();
            }
        }, 350);

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
var totalDuration = Cesium.JulianDate.secondsDifference(timeFinal, startTime);
if (elapsed >= totalDuration - 0.1) {
var topBoard = document.getElementById("gcs_live_telemetry_top_board");
if (topBoard) topBoard.parentNode.removeChild(topBoard);
}
var stage = "takeoff";
var statusStr = "대기중";
if (elapsed <= t_wait) {
stage = "takeoff"; statusStr = "대기중";
} else if (elapsed > t_wait && elapsed <= t_takeoff) {
stage = "takeoff"; statusStr = "이륙중";
} else if (elapsed > t_takeoff && elapsed <= t_hover) {
stage = "takeoff"; statusStr = "방향 선회 호버링";
} else if (elapsed > t_hover && elapsed <= t_cruise_end) {
stage = "cruise";
statusStr = "임무 경로 순항중";
if (window.gcsHoverScheduleTimestamps) {
for (var k = 0; k < window.gcsHoverScheduleTimestamps.length; k++) {
var sch = window.gcsHoverScheduleTimestamps[k];
if (elapsed >= sch.start && elapsed <= sch.end) {
statusStr = sch.name + " 제자리 호버링 및 방향 조향중";
break;
}
}
}
} else {
stage = "land"; statusStr = "목적지 임무완수 호버링";
}
window.gcsLiveDroneCamMetrics.lon = lon;
window.gcsLiveDroneCamMetrics.lat = lat;
window.gcsLiveDroneCamMetrics.alt = alt;
window.gcsLiveDroneCamMetrics.currentStage = stage;
window.gcsLiveDroneCamMetrics.droneHeading = currentHeading;
window.gcsLiveDroneCamMetrics.cameraHeading = mainViewer.camera.heading || 0;
var statusLabelSpan = document.getElementById("gcs_live_telemetry_status_text");
if (statusLabelSpan) {
statusLabelSpan.textContent = statusStr;
if (statusStr.includes("이륙")) statusLabelSpan.style.color = "#ff9f43";
else if (statusStr.includes("호버링")) statusLabelSpan.style.color = "#2ecc71";
else if (statusStr.includes("이동") || statusStr.includes("순항")) statusLabelSpan.style.color = "#54a0ff";
}
if (isPopupEnabled && window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
window.gcsExternalMonitorWindow.focus();
if (typeof window.gcsExternalMonitorWindow.gcsRefreshHUDVideoFrame === "function") {
window.gcsExternalMonitorWindow.gcsRefreshHUDVideoFrame(stage, currentHeading, mainViewer.camera.heading);
}
}
};
mainViewer.scene.postRender.addEventListener(window.gcsMultiCamRenderListener);
}
};


// =========================================================================
// 🚀 [simul.js 최종 완성본 - 파트 2: 비간섭 하드웨어 스트림 및 단일 대형 HUD 모니터]
// =========================================================================

window.gcsExternalMonitorWindow = null;

window.gcsOpenThreeChannelSubVideoHUD = function() {
    var panelIds = ["gcs_upward_panel", "gcs_forward_panel", "gcs_downward_panel"];
    for (var i = 0; i < panelIds.length; i++) {
        var el = document.getElementById(panelIds[i]); 
        if (el) el.parentNode.removeChild(el);
    }

    if (window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
        window.gcsExternalMonitorWindow.close();
    }

    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;
    var mainCanvas = mainViewer.scene.canvas;
    if (!mainCanvas) return;

    var captureStream = mainCanvas.captureStream ? mainCanvas.captureStream(30) : mainCanvas.mozCaptureStream(30);
    window.gcsSharedCanvasStream = captureStream;

    var popupLeft = window.screen.width - 540; 
    window.gcsExternalMonitorWindow = window.open("", "GCS_Single_Auto_HUD", "width=480,height=420,left=" + popupLeft + ",top=100,resizable=yes,scrollbars=no,status=no,alwaysRaised=yes");

    if (!window.gcsExternalMonitorWindow) {
        return;
    }

    var popupDoc = window.gcsExternalMonitorWindow.document;
    popupDoc.open();
    popupDoc.write('<!DOCTYPE html><html><head><title>🛸 GCS 스마트 미션 라이브 HUD</title></head><body></body></html>');
    popupDoc.close();

    var popupBody = popupDoc.body;
    
    var cssStyle = popupDoc.createElement("style");
    cssStyle.textContent = 
        'body { margin: 0; padding: 12px; background: #070d19; color: #fff; font-family: "Malgun Gothic", sans-serif; overflow: hidden; }' +
        '.cam-panel { width: 100%; height: calc(100% - 4px); background: #0b1320; border: 3px solid #ff9f43; border-radius: 8px; position: relative; overflow: hidden; box-shadow: 0 6px 25px rgba(0,0,0,0.6); transition: border-color 0.3s ease; }' +
        '.title-bar { font-size: 13px; font-weight: bold; padding: 8px 12px; display: flex; justify-content: space-between; border-bottom: 2px solid rgba(255,255,255,0.15); transition: background-color 0.3s ease; }' +
        '.video-area { width: 100%; height: calc(100% - 37px); background: #000; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }' +
        'video { width: 100%; height: 100%; object-fit: cover; transform-origin: center center; }' +
        '@keyframes blink { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }';
    popupDoc.head.appendChild(cssStyle);

    var camPanel = popupDoc.createElement("div");
    camPanel.className = "cam-panel";
    camPanel.id = "gcs_main_hud_panel";

    var titleBar = popupDoc.createElement("div");
    titleBar.className = "title-bar";
    titleBar.id = "gcs_hud_title_bar";
    titleBar.style.backgroundColor = "#d35400";

    var modeText = popupDoc.createElement("span");
    modeText.id = "gcs_hud_mode_text";
    modeText.textContent = "🚨 [수직 이륙 단계] 리얼 정향 상방 하늘 감시 뷰 (+90°)";
    titleBar.appendChild(modeText);

    var liveDot = popupDoc.createElement("span");
    liveDot.style.color = "#ff4757";
    liveDot.style.animation = "blink 1s infinite";
    liveDot.textContent = "● 라이브 HUD";
    titleBar.appendChild(liveDot);
    camPanel.appendChild(titleBar);

    var videoArea = popupDoc.createElement("div");
    videoArea.className = "video-area";
    var videoEl = popupDoc.createElement("video");
    videoEl.id = "gcs_hud_video";
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoArea.appendChild(videoEl);
    camPanel.appendChild(videoArea);
    popupBody.appendChild(camPanel);

    if (window.gcsSharedCanvasStream) {
        videoEl.srcObject = window.gcsSharedCanvasStream;
    }

    var runScript = popupDoc.createElement("script");
    runScript.textContent = 
        'var videoEl = document.getElementById("gcs_hud_video");' +
        'var titleBar = document.getElementById("gcs_hud_title_bar");' +
        'var modeText = document.getElementById("gcs_hud_mode_text");' +
        'var panelFrame = document.getElementById("gcs_main_hud_panel");' +
        'window.gcsRefreshHUDVideoFrame = function(stage, droneHeading, camHeading) {' +
        '    var rotationOffset = droneHeading - camHeading;' +
        '    var rotDeg = -(rotationOffset * (180 / Math.PI)) + 90.0;' + 
        '    if (stage === "takeoff") {' +
        '        titleBar.style.backgroundColor = "#d35400";' +
        '        panelFrame.style.borderColor = "#ff9f43";' +
        '        modeText.textContent = "🚨 [수직 이륙 단계] 리얼 정향 상방 하늘 감시 뷰 (+90°)";' + 
        '        videoEl.style.transform = "rotate(" + rotDeg + "deg) scale(2.0, 2.0) translateY(40px)";' + 
        '    } else if (stage === "cruise") { ' +
        '        titleBar.style.backgroundColor = "#2980b9";' +
        '        panelFrame.style.borderColor = "#54a0ff";' +
        '        modeText.textContent = "🛸 [자율 순항 단계] 드론 메인 바짝 밀착 전방 1인칭 시야 (0°)";' + 
        '        videoEl.style.transform = "rotate(" + rotDeg + "deg) scale(3.5) translateY(20px)";' + 
        '    } else if (stage === "land") {' +
        '        titleBar.style.backgroundColor = "#27ae60";' +
        '        panelFrame.style.borderColor = "#2ecc71";' +
        '        modeText.textContent = "📸 [도착 착륙 단계] 리얼 수직 하방 카메라 지면 안착 뷰 (-90°)";' + 
        '        videoEl.style.transform = "rotate(" + rotDeg + "deg) scale(2.0, 1.1) translateY(-45px)";' + 
        '    }' +
        '};';
    popupDoc.body.appendChild(runScript);
};

window.stopGcsDroneSimulation = function() {
    if (window.gcsExternalMonitorWindow && !window.gcsExternalMonitorWindow.closed) {
        window.gcsExternalMonitorWindow.close();
    }
    window.gcsSharedCanvasStream = null;
    var topBoard = document.getElementById("gcs_live_telemetry_top_board");
    if (topBoard) topBoard.parentNode.removeChild(topBoard);

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

window.gcsBuildLiveStatusDashboardUI = function() {
    var oldBoard = document.getElementById("gcs_live_telemetry_top_board");
    if (oldBoard) oldBoard.parentNode.removeChild(oldBoard);

    var board = document.createElement("div");
    board.id = "gcs_live_telemetry_top_board";
    board.style.cssText = "position: fixed; left: 52%; top: 22px; transform: translateX(-50%); background: rgba(11, 19, 32, 0.92); border: 2px solid #54a0ff; border-radius: 20px; padding: 6px 22px; z-index: 99999; box-shadow: 0 6px 20px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 10px; font-family: 'Malgun Gothic', sans-serif; pointer-events: none;";
    
    board.innerHTML = `
        <span style="color: #85929e; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">📡 STATUS :</span>
        <span id="gcs_live_telemetry_status_text" style="color: #2ecc71; font-size: 13px; font-weight: 900; text-shadow: 0 0 8px rgba(46,204,113,0.4);">대기중</span>
    `;
    
    var mainMapFrame = document.getElementById("vmap") || document.body;
    mainMapFrame.appendChild(board);
};

/**
 * 🎯 [경유지 추가 락온 오동작 버그 영구 봉합 완치 커맨드]
 */
window.triggerGcsCommand = function(actionType) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var viewer = ws3d.viewer;

    var rawCameraHeight = Math.round(viewer.camera.positionCartographic.height);
    if (isNaN(rawCameraHeight) || rawCameraHeight <= 0) rawCameraHeight = 300;

    var halvedGcsHeight = Math.round(rawCameraHeight * 0.5);

    var altInput = document.getElementById("adaptive_alt_input") || document.querySelector("input[type='number']");
    if (altInput) {
        altInput.value = halvedGcsHeight;
        var nextNode = altInput.nextSibling;
        while (nextNode) {
            if (nextNode.nodeType === 3) { nextNode.textContent = " m"; break; }
            nextNode = nextNode.nextSibling;
        }
    }
    
    var numLon = parseFloat(window.gcsLastRightClickLon);
    var numLat = parseFloat(window.gcsLastRightClickLat);
    if (isNaN(numLon) || isNaN(numLat) || numLon === 0) return;

    if (!window.waypointList) window.waypointList = [];

    // 🎯 [완치 포인트 1] 원천 조건 노드 빌드 스택 격리 분리 수행
    if (actionType === "home") {
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
}
// 🎯 [완치 포인트 2] 지도를 폭사시키던 짝짝이 변수 오타를 완벽히 도려내고
// 정형화된 로컬 상수 바인딩 블록(var itemNode = ...) 구조로 일괄 가설 갱신 마감!!
var cleanList = [];
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
var groundRing = viewer.entities.add({
position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 0.0),
ellipse: { semiMajorAxis: 22.0, semiMinorAxis: 22.0, material: nodeColor.withAlpha(0.12), outline: true, outlineColor: nodeColor.withAlpha(0.4), outlineWidth: 2 }
});
window.gcsFireZoneEntities.push(groundRing);
var degreesRadius = 0.000175;
var wallPositions = [];
for (var a = 0; a <= 360; a += 15) {
var rad = Cesium.Math.toRadians(a);
var wLon = node.lon + (degreesRadius * Math.cos(rad));
var wLat = node.lat + (degreesRadius * Math.sin(rad));
wallPositions.push(Cesium.Cartesian3.fromDegrees(wLon, wLat));
}
var boldSolidVerticalWallPipe = viewer.entities.add({
wall: {
positions: wallPositions,
maximumHeights: new Array(wallPositions.length).fill(nodeAlt),
minimumHeights: new Array(wallPositions.length).fill(0.0),
material: nodeColor.withAlpha(0.32),
outline: true, outlineColor: nodeColor.withAlpha(0.6), outlineWidth: 2
}
});
window.gcsFireZoneEntities.push(boldSolidVerticalWallPipe);
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
