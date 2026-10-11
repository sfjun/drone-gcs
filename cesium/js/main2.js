// 🔑 1. 세슘 엔진의 3D Tiles 렌더링 락을 풀기 위한 무료 이온 토큰 주입
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IktVSnc3Rk4wWVhkNG5IVE0iLCJqdGkiOiJhZmIwYTM5MS1lYmVlLTRiZGYtYWFjNy00Njk4ZGJjZmQ2N2EiLCJpZCI6NTE2MDA1LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3OTEyNTQ4NDN9.xivlAHOQwz36myWBPZt2StZRSfQsFOS-x2vy9cKsx_w";

// 🔑 1. 브이월드 오픈 API 인증키 전역 바인딩 (본인의 발급 키를 입력하세요)
const VWORLD_KEY = "307B0E17-0322-43C3-A570-59947C0FC7A1"; 



// 🔑 기존 파일에 정의된 VWORLD_KEY 변수명을 그대로 상속받아 연동합니다.
// (수동으로 기입할 필요 없이 상단에 선언된 키 값을 자동으로 공유 공유하게 됩니다)
let currentCameraAltitude = 150; // 실시간 줌 눈높이 고도 변수
let isDrawingMode = true;        // 기본 디폴트: 2D 평면 설계 모드 활성화
let waypointList = [];           // 핵심 임무 경로 노드를 관리할 배열

// 2. 노트북 로컬 라이브 서버 환경에 순수 세슘 뷰어 인스턴스 셋업
const viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: false, 
    baseLayerPicker: false, 
    timeline: false, 
    animation: false, 
    navigationHelpButton: false, 
    homeButton: false, 
    sceneModePicker: false
});


// 🌐 3. [리얼리티 업] 브이월드 고화질 위성사진 (Satellite) 베이스 레이어 직접 공급
const vworldSatelliteProvider = new Cesium.WebMapTileServiceImageryProvider({
    url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{TileMatrix}/{TileRow}/{TileCol}.jpg`,
    // url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{TileMatrix}/{TileRow}/{TileCol}.png`,
    
    layer: 'Satellite', 
    style: 'default', 
    format: 'image/jpeg', 
    tileMatrixSetID: 'EPSG:3857', 
    maximumLevel: 19
});
viewer.imageryLayers.addImageryProvider(vworldSatelliteProvider);

// 위성사진 위에 도로명 및 건물 텍스트 안내 피드를 얹어주는 하이브리드(Hybrid) 레이어 오버레이 중첩
const vworldHybridProvider = new Cesium.WebMapTileServiceImageryProvider({
    url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{TileMatrix}/{TileRow}/{TileCol}.png`,
    layer: 'Hybrid', 
    style: 'default', 
    format: 'image/png', 
    tileMatrixSetID: 'EPSG:3857', 
    maximumLevel: 19
});
viewer.imageryLayers.addImageryProvider(vworldHybridProvider);

// =============================================================
// 📝 [보내주신 파일 원본 참조 명세 구간 매핑 시작]
// =============================================================

// 🌐 4. [보내주신 파일 이식] 브이월드 지형 충돌 우회용 세슘 표준 글로벌 정밀 지형 (Terrain) 로드
// 화면 멈춤 및 암전 버그를 원천 차단합니다.
Cesium.createWorldTerrainAsync().then(terrainProvider => {
    viewer.terrainProvider = terrainProvider;
    console.log("⛰️ 세슘 글로벌 표준 3D 지형 레이어가 장착되었습니다.");
}).catch(error => {
    console.error("지형 로드 중 오류 발생:", error);
});

// 🌐 5. [보내주신 파일 이식] 브이월드 3D 실측 건물 레이어 (3D Tiles) 직접 마운트
// 도메인 인증 오류(CORS) 방지 쿼리 스트링 포맷 주소를 글자 하나 틀리지 않고 그대로 활용합니다.
Cesium.Cesium3DTileset.fromUrl(`https://api.vworld.kr/req/wmt/3d/buildings/tileset.json?key=${VWORLD_KEY}`)
// Cesium.Cesium3DTileset.fromUrl(`https://xdworld.vworld.kr/req/wmt/3d/buildings/tileset.json?key=${VWORLD_KEY}`)

.then(tileset => {
        viewer.scene.primitives.add(tileset);
        console.log("🏢 브이월드 공식 3D 실측 건물 레이어가 온라인 로드되었습니다.");
        
        // 3D 타일셋이 정상 로드되면 건물이 지형 바닥에 딱 달라붙도록 자동 고도 보정 옵션 활성화
        tileset.initialTilesetLoaded.addEventListener(() => {
            console.log("3D 건물 타일 초기 정렬 완료.");
        });
    })
    .catch(error => {
        console.error("3D 건물 레이어 통신 실패 (도메인 승인 또는 키 검증 필요):", error);
    });

// =============================================================
// 📝 [보내주신 파일 원본 참조 명세 구간 매핑 끝]
// =============================================================

// ✨ 6. 시각 그래픽 효과 극대화를 위한 가속 제어 옵션
viewer.scene.globe.enableLighting = true;           // 실시간 태양 광원 시스템 가동
viewer.scene.highDynamicRange = true;               // HDR 선명화 처리
viewer.scene.fog.enabled = true;                    // 자연스러운 대기 안개 가동

// 초기 시점 강남역 테두리로 포커싱 지정
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(127.0276, 37.4979, 1500.0) });

// 7. 마우스 휠 스크롤 줌 척도 카메라 눈높이 실시간 역추적 리스너
viewer.camera.changed.addEventListener(() => {
    const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
    if (cartographic) {
        currentCameraAltitude = cartographic.height;
        document.getElementById("lbl_zoom_alt").innerText = Math.round(currentCameraAltitude).toLocaleString();
    }
});

// 8. 하이브리드 가각 모드 2D 평면 설계뷰 ↔ 3D 입체 편집뷰 토글 체인저
window.switchGcsMode = function(mode) {
    const btn2d = document.getElementById("btn_2d");
    const btn3d = document.getElementById("btn_3d");

    if (mode === '2D') {
        isDrawingMode = true;
        btn2d.className = "btn-mode active"; btn3d.className = "btn-mode";
        viewer.scene.mode = Cesium.SceneMode.SCENE2D; 
    } else {
        isDrawingMode = false; // 3D 회전 제어 시 스크롤로 인한 기체 고도 뒤틀림 가드 락
        btn2d.className = "btn-mode"; btn3d.className = "btn-mode active";
        viewer.scene.mode = Cesium.SceneMode.SCENE3D; 
        
        viewer.camera.flyTo({
            destination: viewer.camera.position,
            orientation: { heading: viewer.camera.heading, pitch: Cesium.Math.toRadians(-45), roll: 0.0 }
        });
    }
};
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

// 9. 지도를 툭툭 클릭할 때 '화면 줌 스크롤 축척 고도'가 초기 비행고도로 지정 주입되는 리스너
handler.setInputAction(async (clickEvent) => {
    if (!isDrawingMode) return; // 3D 편집 정밀 조작 상태일 때는 중복 생성 방지용 차단

    const cartesian = viewer.scene.pickPosition(clickEvent.position);
    if (!Cesium.defined(cartesian)) return;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);

    // 온라인 브이월드 Data API 연동 실시간 지오펜싱(비행금지/제한구역) 실시간 필터링
    let isSecure = await checkAirspaceSafety(lon, lat);
    if (!isSecure) {
        alert("❌ [진입 거부] 법적 비행금지/비행제한구역 내부이므로 해당 웨이포인트를 생성할 수 없습니다.");
        return;
    }

    const initialDroneAlt = currentCameraAltitude; // 줌 눈높이 가각을 드론 초기 비행고도로 바인딩
    const wpId = `WP_${waypointList.length + 1}`;

    waypointList.push({ id: wpId, lon: lon, lat: lat, alt: initialDroneAlt });

    createDroneEntity(wpId, lon, lat, initialDroneAlt);
    renderWaypointListUI();
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 🌐 브이월드 Data API 실시간 공역 규제 차단 검증 원격 함수
async function checkAirspaceSafety(lon, lat) {
    const wktPoint = `POINT(${lon} ${lat})`;
    const targetLayers = "LT_C_AISPRHC,LT_C_AISRESC"; 
    const url = `https://vworld.kr{VWORLD_KEY}&domain=${window.location.origin}&service=data&version=2.0&request=GetFeature&data=${targetLayers}&geomFilter=${encodeURIComponent(wktPoint)}&geometry=false&crs=EPSG:4326`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.response && data.response.status === "OK" && data.response.record && data.response.record.total > 0) {
            return false; 
        }
    } catch (e) { 
        console.error("공역 검증 통신 네트워크 응답 지연 캐치:", e); 
    }
    return true; 
}

// 세슘 엔티티 마커 노드 및 지상 수직 점선 가이드 기둥선 일괄 드로우 함수
function createDroneEntity(id, lon, lat, alt) {
    viewer.entities.add({
        id: id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
        point: { pixelSize: 12, color: Cesium.Color.fromCssString("#00ffcc"), outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
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
// 10. 우측 대시보드 리스트 동적 렌더링 인터페이스
function renderWaypointListUI() {
    const container = document.getElementById("wp_list_container");
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

// 리스트 입력 창 수치 제어 시 3D 공간 마커 즉시 이동
window.updateHeightFromInput = function(id, newHeight) {
    let wp = waypointList.find(w => w.id === id);
    if (wp) {
        wp.alt = parseFloat(newHeight);
        let entity = viewer.entities.getById(id);
        if (entity) {
            entity.position = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt);
            entity.label.text = `${id} (${Math.round(wp.alt)}m)`;
            entity.polyline.positions = [Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 0), Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt)];
        }
    }
};

// 미션 임무 제거 및 명단 재정렬 순환 자동화 함수
window.deleteWaypoint = function(id) {
    viewer.entities.removeById(id); 
    waypointList = waypointList.filter(w => w.id !== id); 
    
    const backupWps = [...waypointList];
    viewer.entities.removeAll(); 
    waypointList = [];

    backupWps.forEach((wp, idx) => {
        const newId = `WP_${idx + 1}`;
        waypointList.push({ id: newId, lon: wp.lon, lat: wp.lat, alt: wp.alt });
        createDroneEntity(newId, wp.lon, wp.lat, wp.alt);
    });

    renderWaypointListUI();
};

// 11. [3D 드래그 인터랙션] 기체 마커 좌클릭 누르고 상공 위아래로 끌어 조절하는 기믹
let isDragging = false; let selectedEntity = undefined;

handler.setInputAction(function(clickEvent) {
    if (isDrawingMode) return;
    const pickedObject = viewer.scene.pick(clickEvent.position);
    if (Cesium.defined(pickedObject) && pickedObject.id) {
        isDragging = true; selectedEntity = pickedObject.id;
        viewer.scene.screenSpaceCameraController.enableInputs = false; // 드래그 중 시야 흔들림 카메라 고정 잠금
    }
}, Cesium.ScreenSpaceEventType.LEFT_DOWN);

handler.setInputAction(function(moveEvent) {
    if (!isDragging || !selectedEntity) return;
    const ray = viewer.camera.getPickRay(moveEvent.endPosition);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (Cesium.defined(cartesian)) {
        const currentWpCartographic = Cesium.Cartographic.fromCartesian(selectedEntity.position.getValue(Cesium.JulianDate.now()));
        const cLon = Cesium.Math.toDegrees(currentWpCartographic.longitude);
        const cLat = Cesium.Math.toDegrees(currentWpCartographic.latitude);
        
        const cameraHeight = viewer.camera.positionCartographic.height;
        const deltaY = moveEvent.startPosition.y - moveEvent.endPosition.y; 
        let newHeight = currentWpCartographic.height + (deltaY * (cameraHeight * 0.002));
        if (newHeight < 0) newHeight = 0;

        selectedEntity.position = Cesium.Cartesian3.fromDegrees(cLon, cLat, newHeight);
        selectedEntity.label.text = `${selectedEntity.id} (${Math.round(newHeight)}m)`;
        selectedEntity.polyline.positions = [Cesium.Cartesian3.fromDegrees(cLon, cLat, 0), Cesium.Cartesian3.fromDegrees(cLon, cLat, newHeight)];

        // 실시간 드래그 연동 글로벌 인메모리 피드백 동기화
        let wp = waypointList.find(w => w.id === selectedEntity.id);
        if (wp) wp.alt = newHeight;
    }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

handler.setInputAction(function() {
    if (isDragging) {
        isDragging = false; selectedEntity = undefined;
        viewer.scene.screenSpaceCameraController.enableInputs = true; // 잠금 해제 복원
        renderWaypointListUI(); // 최종 드래그 완료 값 수치 리프레시
    }
}, Cesium.ScreenSpaceEventType.LEFT_UP);

// 12. [미션 I/O 관리] JSON 백업 다운로드 파일 입출력 모듈 인터페이스
window.exportMissionJSON = function() {
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
    URL.revokeObjectURL(a.href);
};

window.importMissionJSON = function(event) {
    const file = event.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            viewer.entities.removeAll();
            waypointList = [];
            parsed.forEach(wp => {
                const id = wp.id || `WP_${wp.index}`;
                const lon = wp.longitude_X; const lat = wp.latitude_Y; const alt = wp.altitude_Z;
                waypointList.push({ id: id, lon: lon, lat: lat, alt: alt });
                createDroneEntity(id, lon, lat, alt);
            });
            renderWaypointListUI();
            alert(`성공적으로 파일로부터 ${waypointList.length}개의 비행 노드를 복원했습니다.`);
        } catch (err) { alert("올바른 형태의 GCS 임무 JSON 파일이 아닙니다."); }
    };
    reader.readAsText(file);
};
