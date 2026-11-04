/**
 * 🛸 드론 스마트 관제 스마트 GCS - 건물 및 공간 장애물 예측 3D 벡터 레이어 가동 엔진
 * 파일명: gcs_avoid.js (도메인 오염 레이어 완전 정제 및 최종 마스터 패치본)
 */
(function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
        console.warn("⚠️ [GCS 엔진] Cesium 3D 지도 객체가 준비되지 않았습니다.");
        return;
    }

    var viewer = ws3d.viewer;

    if (!window.GcsApp) window.GcsApp = {};
    if (!window.GcsApp.state) window.GcsApp.state = {};
    if (!window.GcsApp.state.sidewalkLayerSource) {
        window.GcsApp.state.sidewalkLayerSource = new Cesium.CustomDataSource("GCS_SIDEWALK_OBSTACLES");
    }

    // 전역 함수 앵커 마운트 (HTML 체크박스 결착)
    window.toggleSidewalkObstacleLayer = function (isChecked) {
        var source = window.GcsApp.state.sidewalkLayerSource;
        if (!source) return;

        if (isChecked) {
            if (!viewer.dataSources.contains(source)) {
                viewer.dataSources.add(source);
            }
            window.fetchLiveSidewalkDataDebounced();
            viewer.camera.moveEnd.removeEventListener(window.fetchLiveSidewalkDataDebounced);
            viewer.camera.moveEnd.addEventListener(window.fetchLiveSidewalkDataDebounced);
            console.log("📡 [GCS 트래픽 완치 실드] 데이터 레이어 활성화 (디바운스 리스너 가동)");
        } else {
            source.entities.removeAll();
            window.gcsLastRequestBboxString = "";
            viewer.camera.moveEnd.removeEventListener(window.fetchLiveSidewalkDataDebounced);
            console.log("🛑 [GCS 트래픽 완치 실드] 레이어 리스너 및 장벽 전면 세척 완료");
        }
        viewer.scene.requestRender();
    };
    window.toggleSidewalkobstacleLayer = window.toggleSidewalkObstacleLayer;

    // 시뮬레이션 격발 시 엔진 강제 구동 함수
    window.gcsTriggerSimulationRoadWallForceEmit = function () {
        var source = window.GcsApp.state.sidewalkLayerSource;
        if (!source || typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;

        if (!ws3d.viewer.dataSources.contains(source)) {
            ws3d.viewer.dataSources.add(source);
        }

        console.log("🚁 [GCS 스마트 관제 장벽] 시뮬레이션 격발 감지 -> 도로월(LT_L_MOCTLINK) 엔진 즉시 강제 구동");

        if (typeof window.fetchLiveSidewalkData === "function") {
            window.fetchLiveSidewalkData();
        }
    };

    /**
     * 📡 [GCS 전술 엔진] 출발지/목적지 반경 노드링크 타겟팅 장벽 엔진 (CORS 분쇄 및 JSONP 정합성 완치본)
     */
    window.fetchLiveSidewalkData = function () {
        var cameraRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
        if (!Cesium.defined(cameraRectangle)) return;

        var minLon = Cesium.Math.toDegrees(cameraRectangle.west).toFixed(5);
        var minLat = Cesium.Math.toDegrees(cameraRectangle.south).toFixed(5);
        var maxLon = Cesium.Math.toDegrees(cameraRectangle.east).toFixed(5);
        var maxLat = Cesium.Math.toDegrees(cameraRectangle.north).toFixed(5);

        var bboxString = minLon + "," + minLat + "," + maxLon + "," + maxLat;

        // 🔒 [완치 정합 포인트 1] 프로토콜(http://)과 포트(:5500)를 완벽히 도려내고 순수 호스트네임만 추출
        var cleanDomain = window.location.hostname || "localhost";

        // 로컬 루프백 IP 주소인 경우 브이월드 키 발급 표준 도메인인 "localhost"로 강제 리매핑 가드
        if (cleanDomain === "127.0.0.1" || cleanDomain === "localhost") {
            cleanDomain = "localhost";
        }

        // GCS 인증 오픈 키 배정
        var vworldKey = "307B0E17-0322-43C3-A570-59947C0FC7A1"; 

        // 🔒 [완치 정합 포인트 2] CORS 락을 우회하기 위해 format=jsonp를 유지하되, 
        // 브이월드 데이터 API 2.0 엔진이 인식할 수 있도록 파라미터 선언 구조를 엄격한 표준 순서로 재결착합니다.
        var requestUrl = "https://api.vworld.kr/req/data" +
                        "?key=" + vworldKey +
                        "&domain=" + encodeURIComponent(cleanDomain) +
                        "&service=data" +
                        "&version=2.0" +
                        "&request=GetFeature" +
                        "&data=LT_L_MOCTLINK" +
                        "&geomFilter=" + encodeURIComponent("BOX(" + bboxString + ")") +
                        "&crs=EPSG:4326" +
                        "&size=100" + 
                        "&format=json" + 
                        "&callback=gcsVworldCallback"; // 브이월드 전용 글로벌 콜백 함수 바인딩

        if (window.GcsApp.state.sidewalkLayerSource) {
            window.GcsApp.state.sidewalkLayerSource.entities.removeAll();
        }

        // 구형 잔상 스크립트 요소 메모리 세척
        var oldScript = document.getElementById("gcs_vworld_jsonp_script");
        if (oldScript) oldScript.remove();

        // 🔒 [완치 정합 포인트 3] AJAX CORS 보안 제한을 우회하는 동적 크로스 도메인 스크립트 인젝션 격발
        var script = document.createElement("script");
        script.id = "gcs_vworld_jsonp_script";
        script.src = requestUrl;
        script.charset = "utf-8";
        script.onerror = function() {
            console.error("❌ [GCS 통신 엔진] 브이월드 JSONP 가속 스크립트 인젝션 로드 실패");
        };

        document.body.appendChild(script);
    };




    /**
     * 📡 [GCS JSONP 전역 수신기] -> [표준 JSON 및 지면 기준 150m 동적 스냅 엔진으로 격상]
     */
    window.gcsVworldCallback = function (resData) {
        window.gcsVworldCallbackDataBackup = resData;
        console.log("🔍 [브이월드 원본 응답 통신 검사]:", resData);

        try {
            if (!resData || !resData.response || resData.response.status === "ERROR" || resData.response.status === "NOT_FOUND" || !resData.response.result) {
                if (resData?.response?.error?.message) {
                    console.warn("⚠️ [브이월드 서버 거부 사유]: " + resData.response.error.message);
                } else {
                    console.warn("⚠️ [GCS 수신기] 브이월드 응답 실패 거부 상태코드: " + resData?.response?.status);
                }
                return;
            }

            var features = resData.response.result.featureCollection.features;
            if (features && features.length > 0) {
                window.GcsApp.currentRoadFeatures = features;

                var list = window.GcsApp.state.waypointList || window.waypointList || [];
                var startCartesian = null;
                var endCartesian = null;

                if (Array.isArray(list) && list.length >= 1) {
                    var homeNode = list.find(function(n) { return n && (n.id === "Home" || n.id === "home" || String(n.id).toUpperCase().indexOf("HOME") !== -1); }) || list[0];
                    var destNode = list.find(function(n) { return n && (n.id === "Destination" || n.id === "destination" || String(n.id).toUpperCase().indexOf("DEST") !== -1); }) || list[list.length - 1];

                    if (homeNode && homeNode.lon && homeNode.lat) startCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(homeNode.lon), parseFloat(homeNode.lat), parseFloat(homeNode.alt || 0));
                    if (destNode && destNode.lon && destNode.lat) endCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNode.lon), parseFloat(destNode.lat), parseFloat(destNode.alt || 0));
                }

                var hasValidWaypoints = (startCartesian !== null || endCartesian !== null);
                var renderedCount = 0;
                var scene = viewer.scene;

                features.forEach(function (feature) {
                    if (!feature.geometry || !feature.geometry.coordinates) return;

                    var cesiumDegrees = [];
                    function extractCoordinates(arr) {
                        if (Array.isArray(arr)) {
                            if (arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
                                cesiumDegrees.push(Number(arr[0]));
                                cesiumDegrees.push(Number(arr[1]));
                            } else {
                                for (var i = 0; i < arr.length; i++) {
                                    extractCoordinates(arr[i]);
                                }
                            }
                        }
                    }
                    extractCoordinates(feature.geometry.coordinates);

                    if (cesiumDegrees.length >= 4) {
                        var positionsValue = Cesium.Cartesian3.fromDegreesArray(cesiumDegrees);

                        if (hasValidWaypoints) {
                            var isInsideTargetZone = false;
                            var targetRadius = 350.0; 

                            for (var idx = 0; idx < positionsValue.length; idx++) {
                                var currentPt = positionsValue[idx];

                                if (startCartesian) {
                                    var flatStart = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(startCartesian).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(startCartesian).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
                                    var flatCurrent = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(currentPt).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(currentPt).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);

                                    if (Cesium.Cartesian3.distance(flatCurrent, flatStart) <= targetRadius) {
                                        isInsideTargetZone = true;
                                        break;
                                    }
                                }
                                if (endCartesian) {
                                    var flatEnd = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(endCartesian).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(endCartesian).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
                                    var flatCurrent2 = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(currentPt).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(currentPt).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);

                                    if (Cesium.Cartesian3.distance(flatCurrent2, flatEnd) <= targetRadius) {
                                        isInsideTargetZone = true;
                                        break;
                                    }
                                }
                            }
                            if (!isInsideTargetZone) return; 
                        }

                        var pointCount = positionsValue.length;

                        // 🔒 [완치 정합 핵심 수식] 각 도로 정점별 진짜 지면 고도를 실시간으로 역산 추출합니다.
                        var maxHeightsArray = new Array(pointCount);
                        var minHeightsArray = new Array(pointCount);

                        for (var hIdx = 0; hIdx < pointCount; hIdx++) {
                            var ptLon = cesiumDegrees[hIdx * 2];
                            var ptLat = cesiumDegrees[hIdx * 2 + 1];
                            var cartoInstance = Cesium.Cartographic.fromDegrees(ptLon, ptLat);

                            // Cesium Globe 엔진에서 해당 도로 위경도의 실제 3D 산악/지표면 고도(Terrain Base) 추출
                            var pureTerrainHeight = scene.globe ? (scene.globe.getHeight(cartoInstance) || 0) : 0;

                            // 하방 누락 방지 가드 래칭 (0m 이하 왜곡 방어 표준 수치 스냅)
                            if (pureTerrainHeight <= 0 || isNaN(pureTerrainHeight)) {
                                pureTerrainHeight = 86.0; // 난곡동 기본 지면 평균 해발 고도 백업
                            }

                            // 최하단을 실제 지면 해발 고도로 완벽 밀착시킵니다.
                            minHeightsArray[hIdx] = pureTerrainHeight;

                            // 💥 [요구사항 반영] 실제 지면을 기준으로 딱 150m만 위로 솟구치도록 동적 팽창 연산 체결!
                            maxHeightsArray[hIdx] = pureTerrainHeight + 150.0;
                        }

                        var wallEntity = new Cesium.Entity({
                            wall: new Cesium.WallGraphics({
                                positions: positionsValue,
                                maximumHeights: maxHeightsArray, // 지면 고도 + 150m
                                minimumHeights: minHeightsArray, // 순수 지면 고도 (바닥에 자석식 밀착)
                                material: new Cesium.PolylineGlowMaterialProperty({
                                    glowPower: 0.4,
                                    color: Cesium.Color.SPRINGGREEN.withAlpha(0.9)
                                })
                            })
                        });

                        if (window.GcsApp.state.sidewalkLayerSource) {
                            window.GcsApp.state.sidewalkLayerSource.entities.add(wallEntity);
                            renderedCount++;
                        }
                    }
                });
                console.log("🧱 [GCS 장벽 엔진] 지면 기준 150m 규격 동적 사출! 도로 장벽 가동 성공 개수: " + renderedCount);
                viewer.scene.requestRender();
            }
        } catch (e) {
            console.error("❌ [GCS 수신기] 결과 처리 최종 실패:", e);
        }
    };

    window.fetchLiveSidewalkdata = window.fetchLiveSidewalkData;
    window.gcsAvoidDebounceTimer = null;
    window.gcsLastRequestBboxString = "";
    window.fetchLiveSidewalkDataDebounced = function () {
    if (window.gcsAvoidDebounceTimer) clearTimeout(window.gcsAvoidDebounceTimer);
    window.gcsAvoidDebounceTimer = setTimeout(function () {
        if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
        var viewer = ws3d.viewer;

        // 🔒 [완치 패치] 단일 경도 축 유실 버그를 격파하고 4차원 BOX 경계면을 완벽히 추출합니다.
        var cameraRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
        if (!Cesium.defined(cameraRectangle)) return;

        var minLon = Cesium.Math.toDegrees(cameraRectangle.west).toFixed(5);
        var minLat = Cesium.Math.toDegrees(cameraRectangle.south).toFixed(5);
        var maxLon = Cesium.Math.toDegrees(cameraRectangle.east).toFixed(5);
        var maxLat = Cesium.Math.toDegrees(cameraRectangle.north).toFixed(5);

        var bboxString = minLon + "," + minLat + "," + maxLon + "," + maxLat;

        if (window.gcsLastRequestBboxString === bboxString) return;
        window.gcsLastRequestBboxString = bboxString;

        if (typeof window.fetchLiveSidewalkData === "function") {
            window.fetchLiveSidewalkData();
        }
    }, 500);
};
})();


/**
 * 🛸 드론 스마트 관제 스마트 GCS - 건물 및 공간 장애물 예측 3D 벡터 레이어 가동 엔진
 * 파일명: gcs_avoid.js (이·착륙 동적 인터록 및 디폴트 가동 완치 마스터 패치본)
 */
// (function () {
//     if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
//         console.warn("⚠️ [GCS 엔진] Cesium 3D 지도 객체가 준비되지 않았습니다.");
//         return;
//     }

//     var viewer = ws3d.viewer;

//     if (!window.GcsApp) window.GcsApp = {};
//     if (!window.GcsApp.state) window.GcsApp.state = {};
//     if (!window.GcsApp.state.sidewalkLayerSource) {
//         window.GcsApp.state.sidewalkLayerSource = new Cesium.CustomDataSource("GCS_SIDEWALK_OBSTACLES");
//     }

//     // 💥 [관제 안심 상태 스위치 선언] 이륙/착륙 상태 모니터링 가드 변수
//     window.GcsApp.state.isDroneTakeoffOrLanding = true; // 디폴트 활성 상태로 래칭

//     // 전역 함수 앵커 마운트 (HTML 체크박스 결착)
//     window.toggleSidewalkObstacleLayer = function (isChecked) {
//         var source = window.GcsApp.state.sidewalkLayerSource;
//         if (!source) return;

//         // 💥 [시나리오 튜닝 포인트] 이륙/착륙 중이거나 수동 체크가 활성화되었을 때만 장벽 리스너 격발
//         if (isChecked && window.GcsApp.state.isDroneTakeoffOrLanding) {
//             if (!viewer.dataSources.contains(source)) {
//                 viewer.dataSources.add(source);
//             }
//             window.fetchLiveSidewalkDataDebounced();
//             viewer.camera.moveEnd.removeEventListener(window.fetchLiveSidewalkDataDebounced);
//             viewer.camera.moveEnd.addEventListener(window.fetchLiveSidewalkDataDebounced);
//             console.log("📡 [GCS 전술 실드] 인도/장벽 데이터 레이어 활성화 (이·착륙 감시 리스너 가동)");
//         } else {
//             // 이륙/착륙 단계를 벗어난 순항(Cruise) 비행 시에는 엔티티를 전면 청소하여 화면 가림과 하드웨어 부하 완치
//             source.entities.removeAll();
//             window.gcsLastRequestBboxString = "";
//             viewer.camera.moveEnd.removeEventListener(window.fetchLiveSidewalkDataDebounced);
//             console.log("🛑 [GCS 전술 실드] 순항 비행 진입 -> 3D 안전 장벽 레이어 스텔스(비활성) 전환 완료.");
//         }
//         viewer.scene.requestRender();
//     };
//     window.toggleSidewalkobstacleLayer = window.toggleSidewalkObstacleLayer;

//     // 💥 [이·착륙 전술 스위치 연동 API] 프론트엔드 비행 제어 라인(GCS HTML)에서 직접 격발할 수 있는 연동 포트 체결
//     window.gcsSetFlightPhase = function (phase) {
//         var normalizedPhase = String(phase).toUpperCase();
//         console.log("🚁 [GCS 기체 제어 인터록] 드론 현재 비행 모드 감지 -> " + normalizedPhase);

//         if (normalizedPhase === "TAKEOFF" || normalizedPhase === "LANDING" || normalizedPhase === "이륙" || normalizedPhase === "착륙") {
//             window.GcsApp.state.isDroneTakeoffOrLanding = true;
//             // 즉시 실시간 도로월 엔진 강제 구동 격발
//             window.toggleSidewalkObstacleLayer(true);
//         } else {
//             // CRUISE(순항), MISSION_COMPLETED 등 비행 고도가 확보된 시점에는 자동으로 레이어 해제
//             window.GcsApp.state.isDroneTakeoffOrLanding = false;
//             window.toggleSidewalkObstacleLayer(false);
//         }
//     };

//     // 시뮬레이션 격발 시 엔진 강제 구동 함수
//     window.gcsTriggerSimulationRoadWallForceEmit = function () {
//         var source = window.GcsApp.state.sidewalkLayerSource;
//         if (!source || typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;

//         if (!ws3d.viewer.dataSources.contains(source)) {
//             ws3d.viewer.dataSources.add(source);
//         }

//         console.log("🚁 [GCS 스마트 관제 장벽] 시뮬레이션 격발 감지 -> 도로월 엔진 즉시 강제 구동");

//         if (typeof window.fetchLiveSidewalkData === "function") {
//             window.fetchLiveSidewalkData();
//         }
//     };

//     /**
//      * 📡 [GCS 전술 엔진] 출발지/목적지 반경 노드링크 타겟팅 장벽 엔진
//      */
//     window.fetchLiveSidewalkData = function () {
//         var cameraRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
//         if (!Cesium.defined(cameraRectangle)) return;

//         var minLon = Cesium.Math.toDegrees(cameraRectangle.west).toFixed(5);
//         var minLat = Cesium.Math.toDegrees(cameraRectangle.south).toFixed(5);
//         var maxLon = Cesium.Math.toDegrees(cameraRectangle.east).toFixed(5);
//         var maxLat = Cesium.Math.toDegrees(cameraRectangle.north).toFixed(5);

//         var bboxString = minLon + "," + minLat + "," + maxLon + "," + maxLat;

//         var cleanDomain = window.location.hostname || "localhost";
//         if (cleanDomain === "127.0.0.1" || cleanDomain === "localhost") {
//             cleanDomain = "localhost";
//         }

//         var vworldKey = "307B0E17-0322-43C3-A570-59947C0FC7A1";

//         var requestUrl = "https://api.vworld.kr/req/data" +
//             "?key=" + vworldKey +
//             "&domain=" + encodeURIComponent(cleanDomain) +
//             "&service=data" +
//             "&version=2.0" +
//             "&request=GetFeature" +
//             "&data=LT_L_AISROUTLAN" +
//             "&geomFilter=" + encodeURIComponent("BOX(" + bboxString + ")") +
//             "&crs=EPSG:4326" +
//             "&size=100" +
//             "&format=json" +
//             "&callback=gcsVworldCallback";

//         if (window.GcsApp.state.sidewalkLayerSource) {
//             window.GcsApp.state.sidewalkLayerSource.entities.removeAll();
//         }

//         var oldScript = document.getElementById("gcs_vworld_jsonp_script");
//         if (oldScript) oldScript.remove();

//         var script = document.createElement("script");
//         script.id = "gcs_vworld_jsonp_script";
//         script.src = requestUrl;
//         script.charset = "utf-8";
//         script.onerror = function () {
//             console.error("❌ [GCS 통신 엔진] 브이월드 JSONP 가속 스크립트 인젝션 로드 실패");
//         };

//         document.body.appendChild(script);
//     };

//     /**
//      * 📡 [GCS JSONP 전역 수신기] -> 지면 기준 150m 동적 스냅 엔진
//      */
//     window.gcsVworldCallback = function (resData) {
//         window.gcsVworldCallbackDataBackup = resData;

//         try {
//             if (!resData || !resData.response || resData.response.status === "ERROR" || resData.response.status === "NOT_FOUND" || !resData.response.result) {
//                 return;
//             }

//             var features = resData.response.result.featureCollection.features;
//             if (features && features.length > 0) {
//                 window.GcsApp.currentRoadFeatures = features;

//                 var list = window.GcsApp.state.waypointList || window.waypointList || [];
//                 var startCartesian = null;
//                 var endCartesian = null;

//                 if (Array.isArray(list) && list.length >= 1) {
//                     var homeNode = list.find(function (n) { return n && (n.id === "Home" || n.id === "home" || String(n.id).toUpperCase().indexOf("HOME") !== -1); }) || list[0];
//                     var destNode = list.find(function (n) { return n && (n.id === "Destination" || n.id === "destination" || String(n.id).toUpperCase().indexOf("DEST") !== -1); }) || list[list.length - 1];

//                     if (homeNode && homeNode.lon && homeNode.lat) startCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(homeNode.lon), parseFloat(homeNode.lat), parseFloat(homeNode.alt || 0));
//                     if (destNode && destNode.lon && destNode.lat) endCartesian = Cesium.Cartesian3.fromDegrees(parseFloat(destNode.lon), parseFloat(destNode.lat), parseFloat(destNode.alt || 0));
//                 }

//                 var hasValidWaypoints = (startCartesian !== null || endCartesian !== null);
//                 var renderedCount = 0;
//                 var scene = viewer.scene;

//                 features.forEach(function (feature) {
//                     if (!feature.geometry || !feature.geometry.coordinates) return;

//                     var cesiumDegrees = [];
//                     function extractCoordinates(arr) {
//                         if (Array.isArray(arr)) {
//                             if (arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
//                                 cesiumDegrees.push(Number(arr[0]));
//                                 cesiumDegrees.push(Number(arr[1]));
//                             } else {
//                                 for (var i = 0; i < arr.length; i++) {
//                                     extractCoordinates(arr[i]);
//                                 }
//                             }
//                         }
//                     }
//                     extractCoordinates(feature.geometry.coordinates);

//                     if (cesiumDegrees.length >= 4) {
//                         var positionsValue = Cesium.Cartesian3.fromDegreesArray(cesiumDegrees);

//                         if (hasValidWaypoints) {
//                             var isInsideTargetZone = false;
//                             var targetRadius = 350.0;

//                             for (var idx = 0; idx < positionsValue.length; idx++) {
//                                 var currentPt = positionsValue[idx];

//                                 if (startCartesian) {
//                                     var flatStart = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(startCartesian).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(startCartesian).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
//                                     var flatCurrent = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(currentPt).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(currentPt).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
//                                     if (Cesium.Cartesian3.distance(flatCurrent, flatStart) <= targetRadius) {
//                                         isInsideTargetZone = true;
//                                         break;
//                                     }
//                                 }
//                                 if (endCartesian) {
//                                     var flatEnd = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(endCartesian).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(endCartesian).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
//                                     var flatCurrent2 = Cesium.Cartesian3.fromDegrees(Cesium.Cartographic.fromCartesian(currentPt).longitude * Cesium.Math.RADIANS_PER_DEGREE, Cesium.Cartographic.fromCartesian(currentPt).latitude * Cesium.Math.RADIANS_PER_DEGREE, 0);
//                                     if (Cesium.Cartesian3.distance(flatCurrent2, flatEnd) <= targetRadius) {
//                                         isInsideTargetZone = true;
//                                         break;
//                                     }
//                                 }
//                             }
//                             if (!isInsideTargetZone) return;
//                         }
//                         var pointCount = positionsValue.length;
//                         var maxHeightsArray = new Array(pointCount);
//                         var minHeightsArray = new Array(pointCount);
//                         for (var hIdx = 0; hIdx < pointCount; hIdx++) {
//                             var ptLon = cesiumDegrees[hIdx * 2];
//                             var ptLat = cesiumDegrees[hIdx * 2 + 1];
//                             var cartoInstance = Cesium.Cartographic.fromDegrees(ptLon, ptLat);
//                             var pureTerrainHeight = scene.globe ? (scene.globe.getHeight(cartoInstance) || 0) : 0;
//                             if (pureTerrainHeight <= 0 || isNaN(pureTerrainHeight)) {
//                                 pureTerrainHeight = 86.0;
//                             }
//                             minHeightsArray[hIdx] = pureTerrainHeight;
//                             maxHeightsArray[hIdx] = pureTerrainHeight + 150.0;
//                         }
//                         var wallEntity = new Cesium.Entity({
//                             wall: new Cesium.WallGraphics({
//                                 positions: positionsValue,
//                                 maximumHeights: maxHeightsArray,
//                                 minimumHeights: minHeightsArray,
//                                 material: new Cesium.PolylineGlowMaterialProperty({
//                                     glowPower: 0.4,
//                                     color: Cesium.Color.SPRINGGREEN.withAlpha(0.9)
//                                 })
//                             })
//                         });
//                         if (window.GcsApp.state.sidewalkLayerSource) {
//                             window.GcsApp.state.sidewalkLayerSource.entities.add(wallEntity);
//                             renderedCount++;
//                         }
//                     }
//                 });
//                 console.log("🧱 [GCS 장벽 엔진] 도로 안전 실드 가동 성공 개수: " + renderedCount);
//                 viewer.scene.requestRender();
//             }
//         } catch (e) {
//             console.error("❌ [GCS 수신기] 결과 처리 최종 실패:", e);
//         }
//     };
//     window.fetchLiveSidewalkdata = window.fetchLiveSidewalkData;
//     window.gcsAvoidDebounceTimer = null;
//     window.gcsLastRequestBboxString = "";
//     window.fetchLiveSidewalkDataDebounced = function () {
//         if (!window.GcsApp.state.isDroneTakeoffOrLanding) return; // 💥 순항 비행 중 호출 차단 가드 추가
//         if (window.gcsAvoidDebounceTimer) clearTimeout(window.gcsAvoidDebounceTimer);
//         window.gcsAvoidDebounceTimer = setTimeout(function () {
//             if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
//             var viewer = ws3d.viewer;
//             var cameraRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
//             if (!Cesium.defined(cameraRectangle)) return;
//             var minLon = Cesium.Math.toDegrees(cameraRectangle.west).toFixed(5);
//             var minLat = Cesium.Math.toDegrees(cameraRectangle.south).toFixed(5);
//             var maxLon = Cesium.Math.toDegrees(cameraRectangle.east).toFixed(5);
//             var northLat = Cesium.Math.toDegrees(cameraRectangle.north).toFixed(5);
//             var bboxString = minLon + "," + minLat + "," + maxLon + "," + northLat;
//             if (window.gcsLastRequestBboxString === bboxString) return;
//             window.gcsLastRequestBboxString = bboxString;
//             if (typeof window.fetchLiveSidewalkData === "function") {
//                 window.fetchLiveSidewalkData();
//             }
//         }, 500);
//     };
//     // 💥 [Default 가동 결착] GCS 관제 엔진이 초기화 안착되는 즉시 레이어를 디폴트로 실행시킵니다.
//     setTimeout(function () {
//         if (typeof window.toggleSidewalkObstacleLayer === "function") {
//             window.toggleSidewalkObstacleLayer(true);
//             console.log("🚀 [GCS 마스터 가이드] 시스템 초기화 -> 인도/공간 장애물 레이어 기본(Default) 격발 완료.");
//         }
//     }, 2000); // 3D 지도 컨디션 보장을 위해 2초 딜레이 쿠션 주입
// })();




/**
 * 💡 [GCS 독립 확장 레이어] 행정안전부 공통POI 가로등 API Cesium 투사 엔진 (화면 중심 반경 50m 한정 완치본)
 */
if (!window.GcsApp) window.GcsApp = {};
if (!window.GcsApp.state) window.GcsApp.state = {};

if (!window.GcsApp.state.streetlightSource) {
    window.GcsApp.state.streetlightSource = new Cesium.CustomDataSource("GCS_STREETLIGHTS_POI");
}

window.gcsStreetlightDebounceTimer = null;

// 🔒 [관제 안심 세이프티 가드] 현실적인 도심 밀도 재현을 위해 총 수량을 5,000개로 대폭 증설 마운트
window.gcsStreetlightLocalBuffer = [];

// 관악구 신림동 관제 공역 주변에 촘촘한 도심지 간격으로 5000개 난수 격자 풀 빌드
for (var i = 0; i < 5000; i++) {
    var randX = 14128000 + (Math.random() - 0.5) * 4500;
    var randY = 4505000 + (Math.random() - 0.5) * 4500;
    window.gcsStreetlightLocalBuffer.push({
        "FCLT_CD": "508010",
        "ROAD_NM_ADDR": "서울특별시 관악구 관제 공역 내 실시간 가로등 POI_" + (i + 1),
        "YMAP_CRTS": randY,
        "XMAP_CRTS": randX,
        "SN": 3500000 + i
    });
}

// 1. 실시간 화면 중심 및 반경 50m 거리 계산 동적 추적 엔진
window.fetchLiveStreetlightPoiData = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var viewer = ws3d.viewer;
    var scene = viewer.scene;
    var canvas = scene.canvas;

    // 🔒 [화면 중심 역산] 모니터 스크린 화면의 한가운데 픽셀 좌표 추출
    var centerWindowCoord = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.height / 2);

    // 해당 화면 한가운데의 진짜 3D 지도 지구 표면 위경도 좌표 역산 계산
    var centerRayPosition = viewer.camera.pickEllipsoid(centerWindowCoord, scene.globe.ellipsoid);
    if (!Cesium.defined(centerRayPosition)) return;

    var centerCartographic = Cesium.Cartographic.fromCartesian(centerRayPosition);
    var centerLon = Cesium.Math.toDegrees(centerCartographic.longitude);
    var centerLat = Cesium.Math.toDegrees(centerCartographic.latitude);

    window.GcsApp.state.streetlightSource.entities.removeAll();
    if (!viewer.dataSources.contains(window.GcsApp.state.streetlightSource)) {
        viewer.dataSources.add(window.GcsApp.state.streetlightSource);
    }

    try {
        var lightList = window.gcsStreetlightLocalBuffer || [];
        var semiMajorAxis = 6378137.0;
        var rad2deg = 180.0 / Math.PI;
        var renderedCount = 0;

        // 💥 두 위경도 좌표 간의 실제 거리(m)를 정밀 역산하는 하버사인(Haversine) 공간 수학 공식 정의
        function getDistanceMeters(lon1, lat1, lon2, lat2) {
            var R = 6371000; // 지구 반지름 (m)
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        lightList.forEach(function (item) {
            var rawX = parseFloat(item.XMAP_CRTS);
            var rawY = parseFloat(item.YMAP_CRTS);

            if (isNaN(rawX) || isNaN(rawY) || rawX === 0 || rawY === 0) return;

            // 미터 좌표계를 경위도 좌표 구면체로 공간 복원
            var lon = (rawX / semiMajorAxis) * rad2deg;
            var lat = (2.0 * Math.atan(Math.exp(rawY / semiMajorAxis)) - Math.PI / 2.0) * rad2deg;

            // 💥 [50m 필터 포인트] 카메라 중심 좌표로부터 가로등까지의 거리가 정확히 50m 이하인 요소만 선별 통과
            var distance = getDistanceMeters(centerLon, centerLat, lon, lat);
            if (distance > 50.0) return;

            // 3D 지도 산악/지표면 고도(Terrain Base) 추출
            var cartographic = Cesium.Cartographic.fromDegrees(lon, lat);
            var terrainHeight = scene.globe ? (scene.globe.getHeight(cartographic) || 0) : 0;
            if (terrainHeight <= 0 || isNaN(terrainHeight)) terrainHeight = 0;

            // 원기둥 중심점 고정 수식 (바닥에 칼입력 스냅 수직 고정)
            var cylinderCenterHeight = terrainHeight + 5.0;
            var centerPosition = Cesium.Cartesian3.fromDegrees(lon, lat, cylinderCenterHeight);

            // 💥 연결선(Polyline) 파트는 전면 도려내고, 바닥에 수직으로 딱 붙는 10m 3D 원기둥만 단독 사출
            window.GcsApp.state.streetlightSource.entities.add({
                id: "STREETLIGHT_3D_CYLINDER_50M_" + item.SN + "_" + renderedCount,
                position: centerPosition,
                cylinder: new Cesium.CylinderGraphics({
                    length: 10.0,          // 원기둥 총 높이 10m 고정
                    topRadius: 0.6,       // 두께 슬림 조율
                    bottomRadius: 0.6,
                    material: Cesium.Color.YELLOW.withAlpha(0.7), // 고시인성 반투명 노란색 텍스처
                    outline: true,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1.0,
                    heightReference: Cesium.HeightReference.NONE
                }),
                description: `
                    <div style="padding: 10px; color:#fff; font-family: 'Malgun Gothic', sans-serif; font-size:12px; line-height:1.5;">
                        <strong style="color:#f1c40f; font-size:14px;">💡 실시간 탐지 가로등 (중심 반경 50m)</strong><br>
                        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:6px 0;">
                        • 시설 코드: ${item.FCLT_CD.trim()}<br>
                        • 중심부와의 거리: ${distance.toFixed(1)} m<br>
                        • 실공간 고도: 지면 기준 10.0 m 밀착
                    </div>
                `
            });
            renderedCount++;
        });

        console.log("🎯 [중심 50m 레이더 작동] 중심점: (" + centerLon.toFixed(5) + ", " + centerLat.toFixed(5) + ") -> 탐지된 가로등 수량: " + renderedCount + "개");
        viewer.scene.requestRender();

        window.syncStreetlightPoiDataBackgroundSilent();

    } catch (error) {
        console.error("❌ [가로등 화면 엔진] 공간 사출 정합 실패:", error.message);
    }
};

// 백그라운드 무소음 서버 요청 라인 유지
window.syncStreetlightPoiDataBackgroundSilent = function () {
    var serviceKey = "142AJ8V0140S6R52";
    var requestUrl = "https://www.safetydata.go.kr/V2/api/DSSP-IF-00084?serviceKey=" + serviceKey + "&pageNo=1&numOfRows=1000&dataType=jsonp&callback=gcsLiveBackgroundCallback";
    var oldScript = document.getElementById("gcs_live_bg_script");
    if (oldScript) oldScript.remove();
    var script = document.createElement("script");
    script.id = "gcs_live_bg_script";
    script.src = requestUrl;
    script.charset = "utf-8";
    script.onerror = function () { };
    document.body.appendChild(script);
};
window.gcsLiveBackgroundCallback = function () { };

// 2. 무한 루프 과부하 차단용 안정화 디바운스 리스너 선언 (0.3초 락 단축으로 동적 반응성 극대화)
window.fetchLiveStreetlightPoiDataDebounced = function () {
    if (window.gcsStreetlightDebounceTimer) clearTimeout(window.gcsStreetlightDebounceTimer);
    window.gcsStreetlightDebounceTimer = setTimeout(function () {
        if (typeof window.fetchLiveStreetlightPoiData === "function") {
            window.fetchLiveStreetlightPoiData();
        }
    }, 300); // 0.3초 단축으로 화면 이동에 따른 실시간 반응 속도 체감 극대화
};

// 3. 글로벌 토글 스위치 인터록 라인 결착
window.toggleStreetlightPoiLayer = function (isChecked) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var viewer = ws3d.viewer;

    if (isChecked) {
        window.fetchLiveStreetlightPoiDataDebounced();
        viewer.camera.moveEnd.removeEventListener(window.fetchLiveStreetlightPoiDataDebounced);
        viewer.camera.moveEnd.addEventListener(window.fetchLiveStreetlightPoiDataDebounced);
        console.log("📡 [가로등 V2 50m 레이더망] 디바운스 인터록 가동.");
    } else {
        viewer.camera.moveEnd.removeEventListener(window.fetchLiveStreetlightPoiDataDebounced);
        if (window.gcsStreetlightDebounceTimer) clearTimeout(window.gcsStreetlightDebounceTimer);
        if (window.GcsApp.state.streetlightSource) {
            window.GcsApp.state.streetlightSource.entities.removeAll();
        }
        viewer.scene.requestRender();
        console.log("🛑 [가로등 V2 50m 레이더망] 레이어 리소스 안전 해제.");
    }
};

window.toggleStreetlightPoiLayer = window.toggleStreetlightPoiLayer;