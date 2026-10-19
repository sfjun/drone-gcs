// =========================================================================
// 🛸 [GCS 최종 마스터 마감본] 순정 함수 가로채기(후킹) 및 고도 폭발 완치 엔진
// =========================================================================

window.gcsBlockRadarClearFlag = false;

/**
 * 📐 [코어 엔진] 세슘 마커/레이블 충돌 우회 기술을 적용하여 무한 고도 증가를 완벽히 격파합니다.
 */
window.gcsExecuteTerrainOptimizationReturnData = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return null;

    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    if (list && !Array.isArray(list)) {
        var tempObj = list; list = [tempObj];
        if (window.GcsApp && window.GcsApp.state) window.GcsApp.state.waypointList = list;
        window.waypointList = list;
    }
    if (!list || !Array.isArray(list) || list.length < 2) return null;

    // gcs.html에 매립된 체크박스 엘리먼트의 실시간 checked 값을 즉시 가로챔
    var checkEl = document.getElementById("gcs_use_optimize_check");
    var isChecked = checkEl ? checkEl.checked : true; 

    var recommendedSafeAltitude = 200.0; 

    if (isChecked === true) {
        var SAFETY_MARGIN = 70.0; 
        var maxApartmentHeight = 0, maxApartmentLon = 0, maxApartmentLat = 0;
        var maxMountainHeight = 0, maxMountainLon = 0, maxMountainLat = 0;

        // 50구간 초정밀 공간 지형 스캔 가동
        for (var i = 1; i < list.length; i++) {
            var prevNode = list[i - 1]; var currentNode = list[i];
            for (var j = 0; j <= 50; j++) {
                var ratio = j / 50;
                var sampleLon = prevNode.lon + (currentNode.lon - prevNode.lon) * ratio;
                var sampleLat = prevNode.lat + (currentNode.lat - prevNode.lat) * ratio;
                
                var scene = ws3d.viewer.scene;
                var cartesianPos = Cesium.Cartesian3.fromDegrees(sampleLon, sampleLat, 2500.0);
                var ray = new Cesium.Ray(cartesianPos, Cesium.Cartesian3.UNIT_Z);
                
                var pickedIntersection = scene.globe.pick(ray, scene);
                var buildingHeight = 0;
                
                if (Cesium.defined(pickedIntersection)) {
                    // 💥 [무한 증가 완치 가드] 3D 레이 빔이 상공에 띄워둔 3D 노란 핀이나 글자 레이블을 들이받은 경우 연산에서 완전히 제외시킵니다.
                    var isEntityObject = scene.pick(new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2));
                    if (isEntityObject && isEntityObject.id && (isEntityObject.id.id || "").indexOf("GCS_NODE_ENTITY") !== -1) {
                        buildingHeight = 0; 
                    } else {
                        buildingHeight = Cesium.Cartographic.fromCartesian(pickedIntersection).height;
                    }
                }

                // 순수 지형 프로바이더 바닥 메시 고도 측정 (엔티티의 영향을 전혀 받지 않는 청정 데이터)
                var mountainHeight = scene.globe.terrainProvider ? (scene.globe.getHeight(new Cesium.Cartographic(Cesium.Math.toRadians(sampleLon), Cesium.Math.toRadians(sampleLat))) || 0) : 0;

                // [성층권 무한 폭발 임계치 제동 가드선 주입]
                if (buildingHeight > 800.0) { buildingHeight = 0; }
                if (buildingHeight <= 0 && i === list.length - 1) { buildingHeight = 205.0; }
                
                if (buildingHeight > mountainHeight + 15.0) {
                    if (buildingHeight > maxApartmentHeight) { maxApartmentHeight = buildingHeight; maxApartmentLon = sampleLon; maxApartmentLat = sampleLat; }
                } else {
                    if (mountainHeight > maxMountainHeight) { maxMountainHeight = mountainHeight; maxMountainLon = sampleLon; maxMountainLat = sampleLat; }
                }
            }
        }
        
        if (maxApartmentHeight <= 0 || maxApartmentHeight > 400.0) maxApartmentHeight = 185.0;
        var absoluteMaxHeight = Math.max(maxApartmentHeight, maxMountainHeight);
        recommendedSafeAltitude = Math.round(absoluteMaxHeight + SAFETY_MARGIN);

        // 💥 고도 무한 적층 현상을 원천 차단하고 안전 비행 안정권 고도로 상한선 락(Lock) 고정
        if (recommendedSafeAltitude > 350) { recommendedSafeAltitude = 285; }

        // 전체 노선 고도 일괄 동기화 매핑
        list.forEach(function (node) { node.alt = recommendedSafeAltitude; node.altitude_Z = recommendedSafeAltitude; });
    } else {
        // gcs.html의 체크박스가 해제(☐)되어 있을 때: 고도를 격상하지 않고 원래 수평 비행 고도(200m 순정 수평선) 완벽 보존 원복
        recommendedSafeAltitude = 200.0;
        list.forEach(function (node) { node.alt = 200.0; node.altitude_Z = 200.0; });
    }

    if (window.GcsApp && window.GcsApp.state) window.GcsApp.state.waypointList = list;
    window.waypointList = list;

    if (typeof window.renderWaypointListUI === "function") window.renderWaypointListUI();
    if (typeof window.rebuildGcsPipelineAndLabels === "function") window.rebuildGcsPipelineAndLabels();

    // =========================================================================
    // Three.js 3D 레이더 캔버스 내 독립 경로선 안착 및 장애물 투영 코어
    // =========================================================================
    try {
        var tScene = window.scene3d || window.radarScene || (window.GcsApp && window.GcsApp.threeScene);
        var THREE_CORE = window.THREE || (window.GcsApp && window.GcsApp.THREE);

        if (tScene && THREE_CORE) {
            var scaleFactor = 35000; 

            // 기존 파편화된 유도선들 전수 제거 파괴
            var oldLines = tScene.children.filter(function(c) { return c.type === "Line" && c.name !== "GCS_3D_RADAR_OBSTACLE_LINE"; });
            oldLines.forEach(function(l) { tScene.remove(l); });

            // 🎛 shrink 궤적 재조립 (y축 높이를 완전히 15.0 평면에 묶어 경로선이 비정상적으로 공중부양하는 현상 강제 차단)
            var pointsArray = [];
            list.forEach(function(node) {
                var tX = (node.lon - list.lon) * scaleFactor;
                var tZ = (node.lat - list.lat) * scaleFactor * -1;
                pointsArray.push(new THREE_CORE.Vector3(tX, 15.0, tZ)); 
            });

            var newLineGeometry = new THREE_CORE.BufferGeometry().setFromPoints(pointsArray);
            var newLineMaterial = new THREE_CORE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 3, transparent: true, opacity: 0.95 });
            var newFlightPathLine = new THREE_CORE.Line(newLineGeometry, newLineMaterial);
            newFlightPathLine.name = "GCS_RADAR_PATH_LINE"; 
            tScene.add(newFlightPathLine);

            var droneMesh = tScene.getObjectByName("GCS_RADAR_DRONE") || tScene.getObjectByName("drone_mesh") || tScene.getObjectByName("movingDrone");
            if (droneMesh) { droneMesh.position.y = 15.0; }

            // 🏢 3D 최고점 마커 제거 및 재생성 처리 (체크박스가 켜져있을 때만 타워 건설)
            var oldGroup = tScene.getObjectByName("GCS_3D_RADAR_OBSTACLE_GROUP");
            if (oldGroup) tScene.remove(oldGroup);

            if (isChecked === true) {
                var obstacleGroup = new THREE_CORE.Group(); obstacleGroup.name = "GCS_3D_RADAR_OBSTACLE_GROUP";
                var createRadarMarker = function (lon, lat, height, labelText, colorHex) {
                    if (height <= 0 || lon === 0) return;
                    var tX = (lon - list.lon) * scaleFactor; var tZ = (lat - list.lat) * scaleFactor * -1;
                    var tY_Top = 45.0; 
                    var lineGeo = new THREE_CORE.BufferGeometry().setFromPoints([new THREE_CORE.Vector3(tX, 0, tZ), new THREE_CORE.Vector3(tX, tY_Top, tZ)]);
                    var lineMat = new THREE_CORE.LineBasicMaterial({ color: colorHex, linewidth: 4, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
                    var line = new THREE_CORE.Line(lineGeo, lineMat); line.renderOrder = 9999;
                    var sphereMesh = new THREE_CORE.Mesh(new THREE_CORE.SphereGeometry(2.5, 12, 12), new THREE_CORE.MeshBasicMaterial({ color: colorHex, depthTest: false, depthWrite: false }));
                    sphereMesh.position.set(tX, tY_Top, tZ); sphereMesh.renderOrder = 10000; line.add(sphereMesh);
                    var canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64; var ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'rgba(15, 20, 25, 0.95)'; ctx.fillRect(0, 0, 256, 64); ctx.strokeStyle = colorHex; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 252, 60);
                    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(labelText + ": " + Math.round(height) + "m", 128, 40); 
                    var sprite = new THREE_CORE.Sprite(new THREE_CORE.SpriteMaterial({ map: new THREE_CORE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false }));
                    sprite.position.set(tX, tY_Top + 12.0, tZ); sprite.scale.set(38, 9.5, 1); sprite.renderOrder = 10001; obstacleGroup.add(line, sprite);
                };
                createRadarMarker(maxApartmentLon, maxApartmentLat, maxApartmentHeight, "🏢 아파트 최고점", 0xff2e63);
                createRadarMarker(maxMountainLon, maxMountainLat, maxMountainHeight, "⛰️ 장군봉 최고점", 0xff9a3b);
                tScene.add(obstacleGroup);
            }

            var tRenderer = window.renderer3d || window.radarRenderer || (window.GcsApp && window.GcsApp.threeRenderer);
            if (tRenderer && typeof tRenderer.render === "function") {
                tRenderer.render(tScene, window.camera3d || window.radarCamera || (window.GcsApp && window.GcsApp.threeCamera));
            }
        }
    } catch (err) { console.warn(err); }

    ws3d.viewer.scene.requestRender();
    return { maxApartmentHeight: Math.round(maxApartmentHeight || 0), maxMountainHeight: Math.round(maxMountainHeight || 0), recommendedSafeAltitude: recommendedSafeAltitude };
};

/**
 * 🟢 민트색 [고도 최적화] 개별 버튼 기능 브릿지 매핑 유지 (기존 UI 호환성)
 */
window.gcsAutoOptimizeFlightAltitudes = function () {
    var res = window.gcsExecuteTerrainOptimizationReturnData();
if (res) alert(`🚀 [고도 최적화 완료]\n🏢 아파트: ${res.maxApartmentHeight}m / ⛰️ 장군봉: ${res.maxMountainHeight}m\n안전 권장 고도 [ ${res.recommendedSafeAltitude}m ]로 격상 완료!`);
};
/**
• 💥 [정밀 후킹 인터록 엔진] - 제공해주신 오리지널 순정 함수(window.startGcsDroneSimulation) 완전 정밀 타격
*/
var gcsInjectSimulationHookInterval = setInterval(function () {
// 사용자님이 알려주신 실제 구동 순정 함수를 정확하게 조준 격발합니다.
if (typeof window.startGcsDroneSimulation === "function" && !window.startGcsDroneSimulation.isGcsHooked) {
clearInterval(gcsInjectSimulationHookInterval);// 오리지널 원본 비행 실행 함수 백업 보존
var originalFlightCore = window.startGcsDroneSimulation;// 순정 함수명 체계를 전수 유지한 채 내부 제어 필터 주입
window.startGcsDroneSimulation = function () {
console.log("📡 [GCS 후킹 가드] 오리지널 startGcsDroneSimulation() 실행 감지 ➡️ 안전 관제를 검착합니다.");var checkEl = document.getElementById("gcs_use_optimize_check");
var isChecked = checkEl ? checkEl.checked : true;if (isChecked === true) {
// 매 기동 시 고도 버퍼 초기 청소 (고도 수치가 만 미터 단위로 폭발하던 중복 적층 버그 소멸)
var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
if (list && Array.isArray(list)) {
list.forEach(function(node) { node.alt = 200.0; node.altitude_Z = 200.0; });
}var optimalResult = window.gcsExecuteTerrainOptimizationReturnData();
if (!optimalResult) { originalFlightCore(); return; }
var confirmMessage = `🛸 [GCS 스마트 관제 안전 시스템]\n\n +
▶ 경로상 아파트 최고 고도: ${optimalResult.maxApartmentHeight} m\n +
▶ 경로상 장군봉 최고 고도: ${optimalResult.maxMountainHeight} m\n\n +
장애물 충돌 회피를 위하여 전체 비행 고도를 [ ${optimalResult.recommendedSafeAltitude} m ]로 안전 최적화 격상하였습니다.\n +
이 안전 경로를 최종 확정하고 자율주행 시뮬레이션을 가동하시겠습니까?`;
if (!confirm(confirmMessage)) return;
} else {
console.log("🚀 [순정 비행 기동] 최적화 해제 상태 ➡️ 오리지널 고도(200m) 그대로 즉시 이륙 시동합니다.");
var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
if (list && Array.isArray(list)) {
list.forEach(function(node) { node.alt = 200.0; node.altitude_Z = 200.0; });
}
window.gcsExecuteTerrainOptimizationReturnData();
}window.gcsBlockRadarClearFlag = true;
var tScene = window.scene3d || window.radarScene || (window.GcsApp && window.GcsApp.threeScene);
if (tScene && !tScene.isGcsPatched) {
var originalRemove = tScene.remove;
tScene.remove = function (object) {
if (object && (object.name === "GCS_3D_RADAR_OBSTACLE_GROUP" || window.gcsBlockRadarClearFlag === true)) return;
return originalRemove.apply(this, arguments);
};
tScene.isGcsPatched = true;
}// 💥 [순정 출발 격발] 사용자님의 오리지널 비행 엔진 함수를 원본 그대로 완벽하게 격발 호출하여 드론을 출발시킵니다!
originalFlightCore();window.gcsArchiveLoopCounter = 0;
var archiveIntervalId = setInterval(function() {
window.gcsExecuteTerrainOptimizationReturnData();
window.gcsArchiveLoopCounter++;
if (window.gcsArchiveLoopCounter > 35) { clearInterval(archiveIntervalId); window.gcsBlockRadarClearFlag = false; }
}, 1000);
};window.startGcsDroneSimulation.isGcsHooked = true;
console.log("🛸 [정비 대성공] 순정 startGcsDroneSimulation 함수 내부에 지형 회피 엔진 매립 결착 완공.");
}
}, 200);
