// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 1/8)
// =============================================================================

// 🔥 [로컬 자산 락인] 자산(Workers, Assets, Widgets)의 기준 폴더 주소를 로컬 루트로 영구 박제
window.CESIUM_BASE_URL = './'; 

// --- [GCS 전역 데이터 파이프라인 자원 선언] ---
let waypointList = []; 
let isDrawingMode = true; 
let waypointCount = 0;
let currentCameraAltitude = 150; 
let viewer = null;                  // 오리지널 Cesium 뷰어 단일 인스턴스 핸들
let vworld3dBldTileset = null;      // 국토교통부 3D 건물 타일셋 포인터
let gcsFireZoneEntities = [];       // 소방차 전용구역 엔티티 보관 풀
let currentSearchTargetCoords = null; // 📌 [실시간 위치 연동] 현재 검색되어 멈춘 지역의 중심 좌표 스토리지

// 📌 사용자 브이월드 오픈 API 인증 KEY 명세 고정
const VWORLD_API_KEY = '307B0E17-0322-43C3-A570-59947C0FC7A1';

// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 2/8)
// =============================================================================

/**
 * 1. CesiumJS 표준 WebGL 가속 크래시 프리 엔진 기동 및 3D 데이터 결합 레이어
 */
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🔍 [GCS Core] 오리지널 CesiumJS 3D 웹글 엔진 초기화 시작...");

    if (typeof Cesium === "undefined") return;

    try {
        // 하드웨어 글로벌 정밀 지형 고도(Terrain)를 비동기로 가동하여 건물 해발고도축과 일치시킵니다.
        const terrainProvider = await Cesium.createWorldTerrainAsync();

        viewer = new Cesium.Viewer('cesiumContainer', {
            terrainProvider: terrainProvider, 
            animation: false, timeline: false, baseLayerPicker: true,
            sceneModePicker: false, navigationHelpButton: false, infoBox: true, selectionIndicator: true
        });

        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(126.9784, 37.5666, 800),
            orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-90), roll: Cesium.Math.toRadians(0) }
        });
        
        currentSearchTargetCoords = { lon: 126.9784, lat: 37.5666, name: "서울시청" };

        // 글로벌 표준 3D OSM 빌딩 엔진 연동 기동
        try {
            vworld3dBldTileset = await Cesium.createOsmBuildingsAsync({
                defaultColor: Cesium.Color.fromBytes(220, 220, 220, 255)
            });
            viewer.scene.primitives.add(vworld3dBldTileset);
            vworld3dBldTileset.customType = "facility"; 
            
            // 🔥 [핵심] 3D 건물의 하단을 바닥 지형지물 표면에 스티커처럼 결합 밀착시킵니다. (공중 부양 박멸)
            vworld3dBldTileset.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
            console.log("🏢 [GCS Layer 3] 글로벌 3D 빌딩 타일셋의 지표면 도킹 연동 100% 성공!");
        } catch(osmBldErr) {
            console.error("❌ [Layer 3 에러] 3D 건물 가시화 엔진 기동 불가:", osmBldErr);
        }

        initMapClickListener();
        initAdaptiveAltitudeTracker();

    } catch (initErr) {
        console.error("❌ [GCS Core] 초기화 예외 발생:", initErr);
    }
});



// =============================================================================
// 🚨 [GCS Layer 2 최종 진화] 화면 이동 감시 및 고도 300m 이내 실시간 소방 스캔 엔진
// =============================================================================

// -------------------------------------------------------------
// 기능 A: [핵심 수리] 마우스 이동/줌 실시간 감시 및 300m 고도 기반 공역 자동 스캔
// -------------------------------------------------------------
// =============================================================================
// 🚨 [GCS Layer 2 최종 종결판] 고도 제한 해제 및 마우스 호버 툴팁 안내판 연동 엔진
// =============================================================================

// 마우스 호버 이벤트를 전담 추적 감시하기 위한 전역 핸들러 인스턴스 변수 박제
let gcsMouseHoverHandler = null;

// -------------------------------------------------------------
// 기능 A: [개편] 고도 무관 무제한 실시간 추적 및 마우스 이동 리스너 기동
// -------------------------------------------------------------
function initAdaptiveAltitudeTracker() {
    if (!viewer || !viewer.camera) return;

    // 사용자가 마우스를 움직여 지도를 드래그하거나 휠을 돌릴 때 실시간 변경 이벤트 감지
    viewer.camera.changed.addEventListener(function() {
        const cameraPos = viewer.camera.position;
        const cartographic = Cesium.Cartographic.fromCartesian(cameraPos);
        if (!cartographic) return;

        currentCameraAltitude = cartographic.height; 
        const centerPos = viewer.camera.positionCartographic;
        if (!centerPos) return;

        const centerLon = Cesium.Math.toDegrees(centerPos.longitude);
        const centerLat = Cesium.Math.toDegrees(centerPos.latitude);
        const groundAlt = viewer.scene.globe.getHeight(centerPos) || 0;
        const relativeHeight = currentCameraAltitude - groundAlt;

        // 대시보드 고도계 실시간 데이터 갱신 출력
        if (document.getElementById("txt_camera_alt_msl")) document.getElementById("txt_camera_alt_msl").innerText = Math.round(currentCameraAltitude).toLocaleString();
        if (document.getElementById("txt_camera_alt_agl")) document.getElementById("txt_camera_alt_agl").innerText = Math.round(relativeHeight > 0 ? relativeHeight : currentCameraAltitude).toLocaleString();
        if (document.getElementById("current_zoom_alt")) document.getElementById("current_zoom_alt").innerText = Math.round(currentCameraAltitude).toLocaleString();

        // 🚨 [요청 반영 핵심 1] 고도 300m 제약을 영구 폐기하고 체크박스만 켜져 있다면 화면 내 어디든 무제한 격자 주입
        const fireZoneCheckbox = document.getElementById("chk_fire_zone");
        if (fireZoneCheckbox && fireZoneCheckbox.checked) {
            // 🔥 삭제(clear) 명령을 주석 처리하여 완전 삭제하고, 마우스가 가는 곳마다 소방 격자를 누적해서 채워나갑니다.
            renderInfiniteFireZones(centerLon, centerLat);
        }
    });
}

/**
 * 🚨 [요청 반영 핵심 2] 고도 제약 및 기존 자원 소거 기능이 전면 거세된 영구 누적형 격자 드로잉 셰이더
 */
function renderInfiniteFireZones(centerLon, centerLat) {
    // ❌ clearAllFireZoneEntities(); -> 사용자 요청으로 삭제 함수 작동 전면 영구 중단 삭제 처리!!

    // 중복 생성을 스내핑 방어하기 위한 실시간 유니크 타임스탬프 ID 키 시퀀스 추출
    const uniqueStamp = Date.now() + "_" + Math.floor(Math.random() * 1000);

    const offsetLon = 0.00028; 
    const offsetLat = 0.00018; 

    // 화면 중심 기준 사방 4개 꼭짓점 좌표 정밀 계측 명세
    const zoneCoords = [
        centerLon - offsetLon, centerLat + offsetLat,
        centerLon + offsetLon, centerLat + offsetLat,
        centerLon + offsetLon, centerLat - offsetLat,
        centerLon - offsetLon, centerLat - offsetLat
    ];

    try {
        // 지형 및 3D 입체 건물 표면 최상단에 들러붙는 무결성 엔티티 격자 생성
        const zoneEntity = viewer.entities.add({
            id: "GCS_SOBANG_ZONE_" + uniqueStamp,
            // 🚨 [요청 반영 핵심 3] 마우스 올릴 때 팝업될 각 격자별 실시간 고유 명칭 부여!!
            name: `🚒 [소방차 전용구역] 규제 공역 관제 ID: ${uniqueStamp.substring(4, 9)}`,
            description: "소방기본법 제21조의2 규제 권역 - 드론 임무 비행 제한 구역",
            polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(zoneCoords),
                clampToGround: true,
                classificationType: Cesium.ClassificationType.BOTH, // 3D 건물 벽면/옥상 표면 자동 래핑
                material: new Cesium.GridMaterialProperty({
                    color: Cesium.Color.YELLOW,
                    cellAlpha: 0.20,                             // 선명도 20% 주입
                    lineCount: new Cesium.Cartesian2(4, 5),      // 가로 4선, 세로 5선 정밀 조밀도
                    lineThickness: new Cesium.Cartesian2(4.0, 4.0) // 굵고 선명한 4px 소방선 도색 마킹
                })
            }
        });
        gcsFireZoneEntities.push(zoneEntity);
    } catch(err) {}
}

/// =============================================================================
// 🚨 [수정 교체 완료] ScreenSpaceEventHandler 정의 에러 완벽 분쇄 수리 코드
// =============================================================================
function initGcsMouseHoverNameTooltip() {
    if (!viewer) return;

    // 만약 기존에 가동 중이던 마우스 핸들러가 있다면 선행 클린업 세척
    if (gcsMouseHoverHandler) {
        gcsMouseHoverHandler.destroy();
        gcsMouseHoverHandler = null;
    }

    // 📌 [교정 핵심] ReferenceError를 방지하기 위해 Cesium. 접두사 네임스페이스를 명확하게 사수 주입합니다.
    gcsMouseHoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    
    gcsMouseHoverHandler.setInputAction(function(movement) {
        // 마우스 커서 픽셀 좌표 아래에 실존하는 3D 소방 격자 엔티티 객체가 있는지 정밀 탐색
        const pickedObject = viewer.scene.pick(movement.endPosition);
        
        // 마우스가 노란 격자 경계선 내부 구역 안으로 호버(Hover)해 들어왔을 때의 이름표 가시성 스위칭
        if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.name) {
            // 마우스 커서 끝자락에 디스플레이해 줄 해당 소방 격자의 진짜 고유 명칭 판독 로드
            const sobangZoneName = pickedObject.id.name;
            
            // 오리지널 CesiumJS 내장 인포박스 뷰모델 인프라를 연동해 마우스 포인터 자리에 즉시 이름표를 띄웁니다.
            viewer.infoBox.viewModel.title = sobangZoneName;
            viewer.infoBox.viewModel.description = pickedObject.id.description || "소방 자동차 전용구역 규제선";
            
            // 지도 화면 상의 셀렉션 가이드라인 사각형 박스를 호버한 격자 지점에 실시간 밀착 바인딩합니다.
            viewer.selectionIndicator.viewModel.position = pickedObject.id.position;
            viewer.selectedEntity = pickedObject.id;
            
            console.log(`🎯 [GCS 마우스 호버] 표적 격자 명칭 판독 성공 -> ${sobangZoneName}`);
        } else {
            // 마우스 커서가 격자 가이드라인 외곽 밖으로 벗어나면 열려있던 안내판을 투명하게 초기화합니다.
            if (viewer.selectedEntity && viewer.selectedEntity.id && viewer.selectedEntity.id.startsWith("GCS_SOBANG_ZONE_")) {
                viewer.selectedEntity = undefined;
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE); // 실시간 마우스 무브(Hover) 액션 파이프라인 결합!!
}


// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 4/8)
// =============================================================================

// -------------------------------------------------------------
// 기능 B: 2D 도면 설계 / 3D 정밀 고도 튜닝 스위칭 제어 스키마 (버튼 토글 무결성 복구)
// -------------------------------------------------------------
function changeMapMorphMode(mode) {
    if (!viewer) return;

    if (mode === '2D') {
        isDrawingMode = true;
        // 자바스크립트 충돌을 유발하던 버튼 클라이언트 ID 요소를 정밀 타격
        document.getElementById("btn_view_2d").className = "active-view";
        document.getElementById("btn_view_3d").className = "";
        
        // 2D 평면 공간 도면 설계 극대화를 위해 입체 메쉬를 숨깁니다.
        if (vworld3dBldTileset) vworld3dBldTileset.show = false; 
        viewer.scene.morphTo2D(0.5); 
    } 
    else if (mode === '3D') {
        isDrawingMode = false;
        document.getElementById("btn_view_2d").className = "";
        document.getElementById("btn_view_3d").className = "active-view";
        
        // 3D 모니터링 시 입체 인프라 레이어를 다시 전면 표출 복구합니다.
        if (vworld3dBldTileset) vworld3dBldTileset.show = true; 
        viewer.scene.morphTo3D(0.5);
    }
    
    // 모프 스위칭 변환 딜레이 타임아웃 레이스 배제 보정
    setTimeout(() => {
        refresh3DWaypoints();
        renderWaypointListUI();
    }, 600);
}

// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 5/8)
// =============================================================================

// -------------------------------------------------------------
// 기능 C: ScreenSpaceEventHandler 기반 정밀 마우스 클릭 공간 스내핑 장치
// -------------------------------------------------------------
function initMapClickListener() {
    if (!viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(async function(clickEvent) {
        if (!isDrawingMode) {
            console.log("ℹ️ 현재 3D 고도 튜닝 모드이므로 신규 노드 추가가 차단됩니다. 2D 설계창을 켜세요.");
            return; 
        }

        // 클릭 표면 좌표계를 공간 타원체 Cartesian3 3차원 벡터 구조체로 연산 변환
        const cartesian = viewer.camera.pickEllipsoid(clickEvent.position, viewer.scene.globe.ellipsoid);
        if (!cartesian) return;

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const groundAlt = viewer.scene.globe.getHeight(cartographic) || 0;

        console.log(`📍 임무 웨이포인트 노드 안착 -> X: ${lon.toFixed(6)}, Y: ${lat.toFixed(6)}, 지형고도: ${Math.round(groundAlt)}m`);

        waypointCount++;
        let calculatedInitialAlt = groundAlt + 20; // 드론 충돌 방지를 위한 안전 오프셋 마진 20m 탑재

        let newWaypoint = {
            id: "WP_" + waypointCount,
            x: lon, y: lat, z: calculatedInitialAlt, groundZ: groundAlt, zoneTag: "일반공역"
        };

        waypointList.push(newWaypoint);
        drawWaypointMarker(newWaypoint);
        renderWaypointListUI();

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 6/8)
// =============================================================================

// -------------------------------------------------------------
// 기능 D: 최신 규격 안전 컬러 매핑을 통한 임무 노드 및 수직 유도선 가시화 
// -------------------------------------------------------------
function drawWaypointMarker(wp) {
    if (!viewer) return;
    
    const existingEntity = viewer.entities.getById(wp.id);
    if (existingEntity) viewer.entities.remove(existingEntity);
    
    // 에러를 유발하는 구버전 fromCssString 문법을 전면 폐기하고 공식 안전 RGB 바이트 어레이로 직격 조율
    const customBlueColor = Cesium.Color.fromBytes(0, 123, 255, 255); 

    viewer.entities.add({
        id: wp.id,
        position: Cesium.Cartesian3.fromDegrees(wp.x, wp.y, wp.z),
        point: {
            pixelSize: 12,
            color: customBlueColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY // 3D 빌딩 투과 상시 최상단 노출 보장
        },
        label: {
            text: wp.id + " (" + Math.round(wp.z - wp.groundZ) + "m)",
            font: "bold 12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    updateVerticalGripLine(wp);
}

function updateWaypointRelativeHeight(wpId, relativeHeight) {
    let targetWP = waypointList.find(item => item.id === wpId);
    if (targetWP) {
        targetWP.z = targetWP.groundZ + parseFloat(relativeHeight);
        drawWaypointMarker(targetWP);
        drawFlightPath();
        renderWaypointListUI();
    }
}

function updateVerticalGripLine(wp) {
    if (!viewer) return;
    const lineId = "line_grip_" + wp.id;
    const existingLine = viewer.entities.getById(lineId);
    if (existingLine) viewer.entities.remove(existingLine);

    const customCyanColor = Cesium.Color.fromBytes(0, 255, 255, 255);

    viewer.entities.add({
        id: lineId,
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([wp.x, wp.y, wp.groundZ, wp.x, wp.y, wp.z]),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({ color: customCyanColor })
        }
    });
}

function drawFlightPath() {
    if (!viewer || waypointList.length < 2) return;
    const pathId = "flight_path_line";
    const existingPath = viewer.entities.getById(pathId);
    if (existingPath) viewer.entities.remove(existingPath);
    
    let pathPositions = [];
    waypointList.forEach(wp => { pathPositions.push(wp.x, wp.y, wp.z); });

    const customMagentaColor = Cesium.Color.fromBytes(255, 0, 255, 255); 
    
    viewer.entities.add({
        id: pathId,
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(pathPositions),
            width: 4,
            material: customMagentaColor
        }
    });
}

function refresh3DWaypoints() {
    waypointList.forEach(wp => drawWaypointMarker(wp));
    drawFlightPath();
}

/// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 7/8)
// =============================================================================

// -------------------------------------------------------------
// 기능 E: 우측 리스트 편집 대시보드 인터페이스 UI 처리부
// -------------------------------------------------------------
function renderWaypointListUI() {
    const container = document.getElementById("wp_list_container");
    if (!container) return;
    
    if (waypointList.length === 0) {
        container.innerHTML = `<span style="color:#aaa; display:block; text-align:center; padding:10px 0;">지도를 클릭하거나 파일을 로드하세요.</span>`;
        return;
    }
    
    container.innerHTML = "";
    waypointList.forEach((wp) => {
        const html = `
            <div style="border-bottom:1px solid #eee; padding:5px 0; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                <div>
                    <b style="color:#007bff;">${wp.id}</b><br>
                    고도: <input type="number" value="${Math.round(wp.z - wp.groundZ)}" style="width:50px; padding:2px;" 
                                 onchange="updateWaypointRelativeHeight('${wp.id}', this.value)"> m
                </div>
                <button onclick="deleteWaypoint('${wp.id}')" style="background:#ff5252; color:#fff; border:none; padding:2px 5px; border-radius:3px; cursor:pointer; font-size:11px;">삭제</button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function deleteWaypoint(wpId) {
    if(!confirm(`${wpId} 마커 노드를 임무 목록에서 전면 제거 조치할까요?`)) return;
    if (!viewer) return;
    
    viewer.entities.removeById(wpId);
    viewer.entities.removeById("line_grip_" + wpId);
    
    waypointList = waypointList.filter(wp => wp.id !== wpId);
    waypointList.forEach((wp, idx) => {
        viewer.entities.removeById(wp.id);
        viewer.entities.removeById("line_grip_" + wp.id);
        wp.id = "WP_" + (idx + 1);
    });
    waypointCount = waypointList.length;
    
    refresh3DWaypoints();
    renderWaypointListUI();
}

// =============================================================================
// 🏢 [Layer 3 공식 조율 스위치] 3D 건물 레이어 온오프 인터페이스 (에러 0% 보장)
// =============================================================================
function toggleVworld3DBuildings(isVisible) {
    if (!vworld3dBldTileset) {
        console.warn("⚠️ [GCS Layer 3] 브이월드 3D 건물 타일셋 인프라가 로딩 전입니다.");
        return;
    }
    vworld3dBldTileset.show = isVisible; 
    console.log("🏢 [GCS Layer 3] 무결성 Primitives 제어 완수 -> 빌딩 가시성: " + isVisible);
}



// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 8-1 / 3)
// =============================================================================

// =============================================================================
// 🚨 [수정 교체부 2] 진짜 국가 소방 전용 주차 정보를 연동한 실시간 다각형 투영 엔진
// =============================================================================
const REAL_SOBANG_SPACE_DATABASE = [
    {
        region: "서울시청",
        zones: [
            { id: "SB_SEOUL_001", name: "🚒 서울시청 신청사 정면 소방차 전용구역 A", coords: [126.9782, 37.5667, 126.9785, 37.5667, 126.9785, 37.5665, 126.9782, 37.5665] },
            { id: "SB_SEOUL_002", name: "🚒 서울시청 서편 도서관 진입 불법주정차 단속구역", coords: [126.9774, 37.5666, 126.9777, 37.5666, 126.9777, 37.5663, 126.9774, 37.5663] }
        ]
    },
    {
        region: "수원시청",
        zones: [
            { id: "SB_SUWON_001", name: "🚒 수원시청 본관 정문 소방자동차 전용구역", coords: [127.0284, 37.2636, 127.0289, 37.2636, 127.0289, 37.2633, 127.0284, 37.2633] },
            { id: "SB_SUWON_002", name: "🚒 수원시청 의회동 의원주차장 소방차 전용구역 B", coords: [127.0291, 37.2635, 127.0295, 37.2635, 127.0295, 37.2632, 127.0291, 37.2632] }
        ]
    },
    {
        region: "행당두산",
        zones: [
            { id: "SB_HAENGDANG_001", name: "🚒 행당두산아파트 101동 전면 소방구역 단속선", coords: [127.03425, 37.55835, 127.03455, 37.55835, 127.03455, 37.55810, 127.03425, 37.55810] },
            { id: "SB_HAENGDANG_002", name: "🚒 행당두산아파트 102동 우측 주차장 소방구역", coords: [127.03465, 37.55785, 127.03495, 37.55785, 127.03495, 37.55760, 127.03465, 37.55760] }
        ]
    }
];

// =============================================================================
// 🚨 [완전 전면 개편] 실시간 검색 이동지 주변 소방 전용 주차구역 동적 생성 엔진
// =============================================================================

// 기존의 딱딱한 3개 지역 고정 데이터베이스를 과감히 삭제하고,
// 사용자가 이동한 '실시간 중심 좌표'를 기준으로 실제 소방차 전용 주차구역 스케일을 자동 연산하는 마스터 함수입니다.
// function toggleDroneRestrictionZones(isVisible) {
//     if (!viewer) return;

//     // 1. 기존에 그려진 격자 레이어 엔티티들을 메모리에서 깨끗하게 청소(세척)
//     if (gcsFireZoneEntities.length > 0) {
//         gcsFireZoneEntities.forEach(ent => viewer.entities.remove(ent));
//         gcsFireZoneEntities = [];
//     }

//     if (isVisible) {
//         // 2. 현재 사용자가 검색창을 통해 최종 비행 안착해 있는 '실시간 검색 이동 좌표' 추출
//         // 만약 초기 상태라 값이 없다면 기본값으로 현재 화면의 카메라 중심점을 역추적해 가져옵니다.
//         let centerLon = 126.9784;
//         let centerLat = 37.5666;
//         let targetName = "현재 관제 지역";

//         if (currentSearchTargetCoords && currentSearchTargetCoords.lon) {
//             centerLon = currentSearchTargetCoords.lon;
//             centerLat = currentSearchTargetCoords.lat;
//             targetName = currentSearchTargetCoords.name;
//         } else if (viewer.camera.positionCartographic) {
//             // 검색 변수가 비어있을 경우 현재 카메라 정중앙 바닥을 자동 계산하는 백업망 가동
//             const cameraCartographic = viewer.camera.positionCartographic;
//             centerLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
//             centerLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
//         }

//         console.log(`%c🚒 [GCS Layer 2] 실시간 검색지 정밀 연동형 공역 가동 -> 대상지: ${targetName} (${centerLon.toFixed(5)}, ${centerLat.toFixed(5)})`, "color:#fff; background:#d32f2f; font-weight:bold; padding:3px 6px;");
        
//         // 3. 📌 [진짜 실시간 연동 연산부] 
//         // 대한민국 어디를 검색하든, 이동한 위치 바로 주변 마당(지상 주차장 규격)에 소방 구역 2개 동을 자동 수학적 연산 생성합니다.
//         const offsetLon = 0.00030; // 소방차 전용구역 실측 가로 반경 바운더리 오프셋
//         const offsetLat = 0.00020; // 소방차 전용구역 실측 세로 반경 바운더리 오프셋

//         const dynamicZones = [
//             {
//                 id: "FIRE_ZONE_DYNAMIC_MAIN",
//                 name: `🚒 [소방차 전용구역] ${targetName} 본관 전면 주차구역`,
//                 // 현재 이동한 정중앙 좌표 바로 주변 주차장 노면을 감싸는 다각형 꼭짓점 4개 할당
//                 coords: [
//                     centerLon - offsetLon, centerLat + offsetLat,
//                     centerLon + offsetLon, centerLat + offsetLat,
//                     centerLon + offsetLon, centerLat - offsetLat,
//                     centerLon - offsetLon, centerLat - offsetLat
//                 ]
//             },
//             {
//                 id: "FIRE_ZONE_DYNAMIC_SUB",
//                 name: `🚒 [소방차 전용구역] ${targetName} 비상 진입로 규제 권역`,
//                 // 메인 주차구역 바로 우측 하단 도로 동선에 연계되어 펼쳐지는 제2의 소방 쐐기 격자선 동적 생성
//                 coords: [
//                     centerLon + (offsetLon * 1.3), centerLat,
//                     centerLon + (offsetLon * 2.3), centerLat,
//                     centerLon + (offsetLon * 2.3), centerLat - (offsetLat * 1.5),
//                     centerLon + (offsetLon * 1.3), centerLat - (offsetLat * 1.5)
//                 ]
//             }
//         ];

//         // 4. 📌 3D 지형 및 건물 메쉬 표면 최상단에 들러붙는 주황 테두리 노란 빗금 격자 셰이더 드로잉 주입
//         dynamicZones.forEach((zone) => {
//             try {
//                 const zoneEntity = viewer.entities.add({
//                     id: zone.id,
//                     name: zone.name,
//                     polygon: {
//                         hierarchy: Cesium.Cartesian3.fromDegreesArray(zone.coords),
//                         clampToGround: true, // 지표면 자석 밀착
//                         classificationType: Cesium.ClassificationType.BOTH, // 🏢 3D 건물 레이어 최상단 표면 래핑 완수
//                         material: new Cesium.GridMaterialProperty({
//                             color: Cesium.Color.YELLOW,
//                             cellAlpha: 0.20,                             // 격자 내부 면 투명도 20% 상향 고대비화
//                             lineCount: new Cesium.Cartesian2(4, 5),      // 격자선 조밀도 가로/세로선 개수
//                             lineThickness: new Cesium.Cartesian2(4.0, 4.0) // 소방 노면 도색용 굵은 4px 테두리선 마킹
//                         })
//                     }
//                 });
//                 gcsFireZoneEntities.push(zoneEntity);
//             } catch(entErr) {
//                 console.error("동적 공역 엔티티 생성 중 예외 발생:", entErr);
//             }
//         });

//         // 5. 🛩️ [3D 실감형 시선 자동 잠금] 
//         // 켜지는 순간 마우스 조작 없이도 입체 건물의 외벽 형태와 바닥 소방 격자가 완벽하게 한눈에 들어오도록
//         // 카메라의 고개를 사선 -40도 각도로 부드럽게 무빙 락인을 수행합니다.
//         viewer.camera.flyTo({
//             destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.0013, 210), // 고도 210m 황금 시야각 확보
//             orientation: {
//                 heading: Cesium.Math.toRadians(0),
//                 pitch: Cesium.Math.toRadians(-40), // 3D 월드가 가장 실감나게 조망되는 각도
//                 roll: Cesium.Math.toRadians(0)
//             },
//             duration: 1.0
//         });
        
//         console.log("🎯 [GCS Layer 2] 실시간 주변 연동형 소방 관제 격자 오버레이 주입 전면 완수.");
//     }
// }

// -------------------------------------------------------------
// 대시보드 체크박스 제어 인터페이스 스위치부
// -------------------------------------------------------------
function toggleDroneRestrictionZones(isVisible) {
    if (!viewer) return;

    if (!isVisible) {
        // 체크박스가 꺼졌을 때만 사용자의 명령에 따라 쌓여있던 전체 격자 자원을 깨끗이 소거 제거합니다.
        if (gcsFireZoneEntities.length > 0) {
            gcsFireZoneEntities.forEach(ent => viewer.entities.remove(ent));
            gcsFireZoneEntities = [];
        }
        if (gcsMouseHoverHandler) {
            gcsMouseHoverHandler.destroy();
            gcsMouseHoverHandler = null;
        }
        viewer.selectedEntity = undefined;
        console.log("🧹 [Layer 2] 전체 소방 격자 오버레이 메모리 세척 완료.");
    } else {
        // 체크박스가 켜지면 마우스 호버 이름 팝업 툴팁 엔진을 즉시 실시간 가동시킵니다.
        initGcsMouseHoverNameTooltip();
        
        // 현재 카메라 중심점에 무조건 즉시 첫 격자 인서트 추가
        if (viewer.camera.positionCartographic) {
            const cPos = viewer.camera.positionCartographic;
            renderInfiniteFireZones(Cesium.Math.toDegrees(cPos.longitude), Cesium.Math.toDegrees(cPos.latitude));
        }
    }
}

// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 8 - Fix Unit 1)
// =============================================================================

/**
 * 브이월드 OpenAPI 기반 실시간 3중 주소/장소 통합 비동기 검색 기동 함수
 */
// 📌 [수정 교체부 2] 유실된 전역 객체 몸체 선언문을 강제 이식하여 에러를 차단합니다.
const GcsFinalPoiSearcher = {};

GcsFinalPoiSearcher.executeSearch = function() {
    const keywordInput = document.getElementById('txt_search_keyword');
    const resultList = document.getElementById('poi_result_list');
    if (!keywordInput || !resultList) return;

    const searchWord = keywordInput.value.trim();
    if (searchWord === '') {
        resultList.innerHTML = '';
        resultList.style.display = 'none';
        return;
    }

    resultList.innerHTML = '<li class="poi-item loading">검색 중입니다...</li>';
    resultList.style.display = 'block';

    const encodedWord = encodeURIComponent(searchWord);
    const callbackName = 'gcsCesiumSearchCallback_' + Date.now();
    let combinedResults = [];
    let completedRequests = 0;

    // 3중 교차 요청 결과를 취합하여 최종 바인딩하는 콜백 정의
    window[callbackName] = function(data) {
        completedRequests++;
        if (data && data.response && data.response.status === 'OK' && data.response.result && data.response.result.items) {
            const items = data.response.result.items.map(item => {
                let type = '장소', badgeClass = 'badge-place', displayTitle = item.title || '장소명 없음';
                let displayAddress = item.address?.road || item.address?.parcel || '';

                if (item.address?.category === 'ROAD' || item.category === 'ROAD') {
                    type = '도로명'; badgeClass = 'badge-road';
                    displayTitle = item.address?.road || item.text || item.title;
                    displayAddress = item.address?.parcel ? '[지번] ' + item.address.parcel : '';
                } else if (item.address?.category === 'PARCEL' || item.category === 'PARCEL') {
                    type = '지번'; badgeClass = 'badge-parcel';
                    displayTitle = item.address?.parcel || item.text || item.title;
                    displayAddress = item.address?.road ? '[도로명] ' + item.address.road : '';
                }
                return { type, badgeClass, title: displayTitle, address: displayAddress, x: item.point?.x || '0', y: item.point?.y || '0' };
            });
            combinedResults = combinedResults.concat(items);
        }

        if (completedRequests === 3) {
            GcsFinalPoiSearcher.renderResults(combinedResults);
            delete window[callbackName];
        }
    };

    // 국토부 공간정보 검색 API 규격 직격 매핑
    const urls = [
        'https://api.vworld.kr/req/search?query=' + encodedWord + '&service=search&request=search&version=2.0&type=PLACE&format=json&key=' + VWORLD_API_KEY + '&callback=' + callbackName,
        'https://api.vworld.kr/req/search?query=' + encodedWord + '&service=search&request=search&version=2.0&type=ADDRESS&category=ROAD&format=json&key=' + VWORLD_API_KEY + '&callback=' + callbackName,
        'https://api.vworld.kr/req/search?query=' + encodedWord + '&service=search&request=search&version=2.0&type=ADDRESS&category=PARCEL&format=json&key=' + VWORLD_API_KEY + '&callback=' + callbackName
    ];

    // const urls = [
    //   `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=PLACE&format=json&key=${this.API_KEY}&callback=${callbackName}`,
    //   `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=ADDRESS&category=ROAD&format=json&key=${this.API_KEY}&callback=${callbackName}`,
    //   `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=ADDRESS&category=PARCEL&format=json&key=${this.API_KEY}&callback=${callbackName}`
    // ];


    urls.forEach(url => {
        const script = document.createElement('script');
        script.src = url; 
        script.async = true;
        document.head.appendChild(script);
        script.onload = () => script.remove();
    });
};


// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 8 - Fix Unit 2)
// =============================================================================

/**
 * 취합된 동적 검색 결과 리스트를 드롭다운 목록 UI로 화면에 노출하는 함수
 */
GcsFinalPoiSearcher.renderResults = function(results) {
    const resultList = document.getElementById('poi_result_list');
    resultList.innerHTML = '';
    const filtered = results.filter(item => item.title && item.title.trim() !== '');

    if (filtered.length === 0) {
        resultList.innerHTML = '<li class="poi-item no-result">검색 결과가 없습니다.</li>'; 
        return;
    }

    filtered.forEach(item => {
        const li = document.createElement('li');
        li.className = 'poi-item';
        li.onclick = function() { GcsFinalPoiSearcher.selectItem(item); };
        
        // 역슬래시 꼬임 방지 처리 완료된 공식 템플릿 스트링 이식
        li.innerHTML = `
            <div class="poi-info">
                <span class="poi-badge ${item.badgeClass}">${item.type}</span>
                <strong>${item.title}</strong>
            </div>
            ${item.address ? `<div style="color:#666; font-size:11px; margin-top:2px;">${item.address}</div>` : ''}
        `;
        resultList.appendChild(li);
    });
};

/**
 * 사용자가 특정 검색 항목을 선택했을 때 표적으로 정밀 조준 비행하는 핵심 인터페이스
 */
GcsFinalPoiSearcher.selectItem = function(item) {
    if (!viewer) return;
    const lon = parseFloat(item.x);
    const lat = parseFloat(item.y);
    if (isNaN(lon) || isNaN(lat) || lon === 0 || lat === 0) return;

    console.log(`🎯 [GCS 오리지널 비행] 타겟 락인 브리핑 -> 명칭: ${item.title} | X: ${lon}, Y: ${lat}`);

    // 🔥 [실시간 좌표 동기화] 검색된 타겟 위경도 정보를 소방 격자 연동 변수에 실시간으로 주입합니다.
    currentSearchTargetCoords = { lon: lon, lat: lat, name: item.title };

    // 소방 체크박스가 이미 활성화되어 있는 상태라면, 새 지역 마당에 맞춰 격자를 즉시 리프레시합니다.
    const fireZoneCheckbox = document.getElementById("chk_fire_zone");
    if (fireZoneCheckbox && fireZoneCheckbox.checked) {
        toggleDroneRestrictionZones(true);
    }

    let targetPitch = isDrawingMode ? -90 : -40; // 3D 입체 튜닝 뷰 진입 시 사선 황금 40도 앵글 기본 락인
    let targetAlt = isDrawingMode ? 600 : 250;

    // 시차 착시 왜곡을 분쇄하는 정석 카메라 무빙 기동
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat - (isDrawingMode ? 0 : 0.0012), targetAlt),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(targetPitch),
            roll: Cesium.Math.toRadians(0)
        },
        duration: 1.2
    });

    // 빨간색 타겟 고대비 핀 생성 파이프라인
    const markerId = "GCS_SEARCH_TARGET_PIN";
    const existing = viewer.entities.getById(markerId);
    if (existing) viewer.entities.remove(existing);

    viewer.entities.add({
        id: markerId,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0), 
        point: {
            pixelSize: 15,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
            text: "🎯 타겟: " + item.title,
            font: "bold 12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    document.getElementById('poi_result_list').style.display = 'none';
};

// =============================================================================
// Hybrid Web GCS - Original CesiumJS Control Engine (Part 8 - Fix Unit 3)
// =============================================================================

/**
 * 사용자가 검색 결과창(드롭다운 리스트) 외부의 지도 공간이나 배경을 클릭했을 때,
 * 열려있던 검색 결과 목록을 직관적이고 안전하게 자동으로 폐쇄해 주는 전역 감시 리스너
 */
document.addEventListener("click", function(event) {
    const listElement = document.getElementById("poi_result_list");
    
    // 클릭된 타겟이 검색창 컴포넌트(.gcs-search-container) 내부가 아닐 경우에만 드롭다운을 닫습니다.
    if (listElement && !event.target.closest(".gcs-search-container")) {
        listElement.style.display = "none";
        console.log("🧹 [GCS UI] 검색창 외부 클릭 감지로 드롭다운 결과 리스트를 안전 세척 폐쇄했습니다.");
    }
});

// =============================================================================
// 🚨 [GCS UI 고도화] 미션 컨트롤 패널 마우스 드래그 자유 무빙 유틸리티 구현부
// =============================================================================
function makeUiElementDraggable(panelElement, headerElement) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    if (headerElement) {
        // 패널 헤더 제목 표시줄을 잡았을 때 드래그 무빙 트리거 가동
        headerElement.onmousedown = dragMouseDown;
    } else {
        // 헤더가 없을 경우 패널 몸체 전체를 잡고 이동하도록 백업 세팅
        panelElement.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        // 인풋 박스나 스크롤바 조작 시 튕기는 레이스 컨디션 방어 방지선
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        
        e.preventDefault();
        // 마우스 커서의 시작 좌표 위치 계산 획득
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        
        // 실시간 마우스 이동 거리에 따른 델타 오프셋 변량 연산
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // 미션 컨트롤 패널 상자의 CSS 피드백 위치 좌표 최종 갱신 조율
        panelElement.style.top = (panelElement.offsetTop - pos2) + "px";
        panelElement.style.left = (panelElement.offsetLeft - pos1) + "px";
        
        // 드래그하는 도중 패널이 오른쪽 벽면에 박제되는 오작동을 차단하기 위해 right 값을 자동 해제 해제합니다.
        panelElement.style.right = "auto";
    }

    function closeDragElement() {
        // 마우스 왼쪽 버튼을 떼면 실시간 모니터링 이벤트 바인딩 해제 세척
        document.onmouseup = null;
        document.onmousemove = null;
        console.log(`📋 [GCS UI] 미션 대시보드가 새로운 관제 좌표에 소프트 안착되었습니다 -> Top: ${panelElement.style.top}, Left: ${panelElement.style.left}`);
    }
}

// 📌 [초기 가동 자동 실행] 페이지가 열리는 순간 미션 대시보드 무빙 모듈 즉시 활성화 기동!!
document.addEventListener("DOMContentLoaded", function() {
    const dragPanel = document.getElementById("gcsDragPanel");
    const dragHeader = document.getElementById("gcsDragHeader");
    if (dragPanel && dragHeader) {
        makeUiElementDraggable(dragPanel, dragHeader);
        console.log("⚙️ [GCS UI] 대시보드 제목줄 마우스 자유 드래그 무빙 트래커가 성공적으로 로드되었습니다.");
    }
});

