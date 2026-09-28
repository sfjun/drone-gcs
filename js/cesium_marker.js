// =========================================================================
// 💡 [관제 확장] 경로점(Waypoint) 시퀀스 관리를 위한 전역 안전장치 레이어
// =========================================================================
if (typeof window.targetMarker === 'undefined') { window.targetMarker = null; }
if (typeof window.homeMarker === 'undefined') { window.homeMarker = null; }
if (typeof window.searchMarker === 'undefined') { window.searchMarker = null; }
if (typeof window.realDroneMarker === 'undefined') { window.realDroneMarker = null; }
if (typeof window.flightPathPolyline === 'undefined') { window.flightPathPolyline = null; }
if (typeof window.homeCoords === 'undefined') { window.homeCoords = null; }
if (typeof window.clickedPosition === 'undefined') { window.clickedPosition = null; }
if (typeof window.droneSocket === 'undefined') { window.droneSocket = null; }
if (typeof window.chatSocket === 'undefined') { window.chatSocket = null; }
if (typeof window.pathPositionsArray === 'undefined') { window.pathPositionsArray = []; }
if (typeof window.isFirstLocation === 'undefined') { window.isFirstLocation = true; }

// 🎯 [신규 추가] 미션 경로 제어용 전역 배열 프레임워크
if (typeof window.missionWaypoints === 'undefined') { window.missionWaypoints = []; } // 정식 경로점 엔티티 배열
if (typeof window.plusGuides === 'undefined') { window.plusGuides = []; }             // 중간 '+' 기호 엔티티 배열
if (typeof window.missionPolyline === 'undefined') { window.missionPolyline = null; }   // 관제 미션 실선 엔티티

var targetMarker = window.targetMarker;
var homeMarker = window.homeMarker;  
var searchMarker = window.searchMarker;
var realDroneMarker = window.realDroneMarker;
var flightPathPolyline = window.flightPathPolyline;
var homeCoords = window.homeCoords;
var clickedPosition = window.clickedPosition;
var droneSocket = window.droneSocket;
var chatSocket = window.chatSocket;
var pathPositionsArray = window.pathPositionsArray;



// 🎯 왜곡과 시차를 100% 제거하고 대상을 화면 정중앙에 정확히 일치시키는 수직 탑뷰 함수
// cesum_marker.js 내의 기존 함수를 아래와 같이 변경합니다.
function flyToGcsStandardView(longitude, latitude) {
    if (!window.viewer) return;
    
    // 1. [강제 제동] 카메라의 모든 물리 엔진 관성과 기존 이동 명령을 즉시 파괴
    window.viewer.camera.cancelFlight(); 
    window.viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
    window.viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;
    window.viewer.scene.screenSpaceCameraController.inertiaZoom = 0.0;
    
    // 2. 위경도 뒤바뀜 역산 보정
    let correctLon = longitude;
    let correctLat = latitude;
    if (Math.abs(longitude) < Math.abs(latitude)) {
        correctLon = latitude;
        correctLat = longitude;
    }
    
    // 3. 3D 타원체 공간 중심좌표 계산
    const targetCartesian = Cesium.Cartesian3.fromDegrees(correctLon, correctLat, 1500.0);
    
    // 4. [핵심 교체] 수직 탑뷰 연산 오류를 물리적으로 완전히 잡기 위해 setView 룩앳 옵션 고정
    window.viewer.camera.setView({
        destination: targetCartesian,
        orientation: {
            heading: 0.0,
            pitch: -Cesium.Math.PI_OVER_TWO, // 정확히 직각(-90도) 바닥을 보게 하여 회전 흐름 차단
            roll: 0.0
        }
    });
}

// =========================================================================
// 🎯 [관제 엔진] 실시간 미션 경로 실선 및 중간 '+' 기호 동적 생성 및 갱신 알고리즘
// =========================================================================
// =========================================================================
// 🎯 [2D 완벽 대응] 미션 경로 실선 및 중간 '+' 기호 동적 생성 알고리즘
// =========================================================================
// =========================================================================
// 🎯 [2D 평면 완전 최적화] 미션 경로 실선 및 팝업형 '+' 가이드 생성 알고리즘
// =========================================================================
function refreshMissionVisualPath() {
    if (!window.viewer || !window.homeMarker || !window.targetMarker) return;

    // 1. 기존에 그려진 선과 + 기호들을 지도에서 완전히 청소
    if (window.missionPolyline) { window.viewer.entities.remove(window.missionPolyline); window.missionPolyline = null; }
    window.plusGuides.forEach(guide => window.viewer.entities.remove(guide));
    window.plusGuides = [];

    // 2. 전체 비행 시퀀스 좌표 추출 (HOME -> 경로점들 -> TARGET)
    const pointsSequence = [];
    pointsSequence.push(window.homeMarker.position.getValue(window.viewer.clock.currentTime));
    window.missionWaypoints.forEach(wp => pointsSequence.push(wp.position.getValue(window.viewer.clock.currentTime)));
    pointsSequence.push(window.targetMarker.position.getValue(window.viewer.clock.currentTime));

    // 3. 🚨 [2D 레이어 버그 해결] 선이 지도 바닥 밑으로 파묻히는 것을 막기 위해 clampToGround를 끄고, 
    // zIndex를 임의로 올려 노란색 안내선이 무조건 최상단에 얹어지도록 렌더링합니다.
    window.missionPolyline = window.viewer.entities.add({
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const currentPoints = [];
                currentPoints.push(window.homeMarker.position.getValue(window.viewer.clock.currentTime));
                window.missionWaypoints.forEach(wp => currentPoints.push(wp.position.getValue(window.viewer.clock.currentTime)));
                currentPoints.push(window.targetMarker.position.getValue(window.viewer.clock.currentTime));
                return currentPoints;
            }, false),
            width: 4,
            material: Cesium.Color.YELLOW, // 2D 모드에서 에러를 유발하는 점선 대신 직관적인 선명한 노란색 실선 사용
            zIndex: 9999
        }
    });

    // 4. 마디 사이에 확실하게 눈에 보이는 파란색 '+' 버튼 엔티티 재배치
    for (let i = 0; i < pointsSequence.length - 1; i++) {
        const p1 = pointsSequence[i];
        const p2 = pointsSequence[i + 1];
        const midCartesian = Cesium.Cartesian3.midpoint(p1, p2, new Cesium.Cartesian3());

        // 2D 픽킹 오차를 없애기 위해 Billboard(이미지)나 확실한 Point 구조로 결합
        const plusEntity = window.viewer.entities.add({
            position: midCartesian,
            point: {
                pixelSize: 26,
                color: Cesium.Color.fromCssColorString('#0284c7'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY // 레이어 덮임 방지
            },
            label: {
                text: '+',
                font: 'bold 18px sans-serif',
                fillColor: Cesium.Color.WHITE,
                style: Cesium.LabelStyle.FILL,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            isPathPlusButton: true,
            insertIndex: i 
        });

        window.plusGuides.push(plusEntity);
    }
}

// 🎯 '+' 클릭 시 호출되는 정식 경로점 주입 함수
function insertNewWaypointAtGuide(midPosition, insertIndex) {
    const wpCount = window.missionWaypoints.length + 1;

    const newWaypoint = window.viewer.entities.add({
        position: midPosition,
        point: { 
            pixelSize: 16, 
            color: Cesium.Color.CHARTREUSE, 
            outlineColor: Cesium.Color.BLACK, 
            outlineWidth: 2, 
            disableDepthTestDistance: Number.POSITIVE_INFINITY 
        },
        label: { 
            text: `📍 경로 ${wpCount}`, 
            font: 'bold 11px sans-serif', 
            fillColor: Cesium.Color.CHARTREUSE, 
            style: Cesium.LabelStyle.FILL_AND_OUTLINE, 
            outlineColor: Cesium.Color.BLACK, 
            outlineWidth: 3, 
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM, 
            pixelOffset: new Cesium.Cartesian2(0, -16), 
            disableDepthTestDistance: Number.POSITIVE_INFINITY 
        },
        isMoveableWaypoint: true 
    });

    window.missionWaypoints.splice(insertIndex, 0, newWaypoint);
    appendGcsTerminalLog(`✨ 경로설정 성공: [경로 ${wpCount}] 마커가 지정되었습니다.`);

    refreshMissionVisualPath();
}

// =========================================================================
// 🎯 [완벽 복구] 문법 오류 4개 교정 및 2D 맵 드래그 내비게이션 통합 제어 엔진
// =========================================================================
function setupPlusButtonInteractionEngine() {
    const scene = window.viewer.scene;
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    
    let isDragging = false;
    let draggedEntity = null;

    handler.setInputAction((clickEvent) => {
        const pickedObjects = scene.drillPick(clickEvent.position);
        
        // 💡 깨짐을 막기 위해 < 기호 대신 '값이 존재함'과 '배열 길이만큼 반복'하는 안전한 while문으로 대체합니다.
        if (Cesium.defined(pickedObjects) && pickedObjects.length > 0) {
            let i = 0;
            const maxLen = pickedObjects.length;
            while (i !== maxLen) {
                const picked = pickedObjects[i];
                if (Cesium.defined(picked) && picked.id) {
                    const entity = picked.id;

                    if (entity.isPathPlusButton === true) {
                        const targetPos = entity.position.getValue(window.viewer.clock.currentTime);
                        const idx = entity.insertIndex;
                        
                        scene.screenSpaceCameraController.enableInputs = false;
                        insertNewWaypointAtGuide(targetPos, idx);
                        scene.screenSpaceCameraController.enableInputs = true;
                        return; 
                    }

                    if (entity.isMoveableWaypoint === true) {
                        isDragging = true;
                        draggedEntity = entity;
                        scene.screenSpaceCameraController.enableInputs = false;
                        return;
                    }
                }
                i = i + 1; // 카운터 증가
            }
        }
        scene.screenSpaceCameraController.enableInputs = true;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement) => {
        if (isDragging && draggedEntity) {
            const cartesian = scene.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid);
            if (Cesium.defined(cartesian)) {
                draggedEntity.position.setValue(cartesian);
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
        if (isDragging) {
            isDragging = false;
            draggedEntity = null;
            scene.screenSpaceCameraController.enableInputs = true;
            
            refreshMissionVisualPath();
            appendGcsTerminalLog("📍 경로 마커 위치가 수동 드래그를 통해 최종 수정되었습니다.");
        }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

// 중앙 하단 관제 터미널 내부 로그 주입 함수
function appendGcsTerminalLog(message, isChat = false) {
    const logBox = document.getElementById('log-display-area'); 
    if (logBox) {
        const timestamp = new Date().toLocaleTimeString();
        const styleColor = isChat ? "color:#f39c12;" : "color:#a3be8c;";
        logBox.innerHTML += `<div style="${styleColor}">[${timestamp}] ${message}</div>`;
        logBox.scrollTop = logBox.scrollHeight;
    }
}

// main_cesium.py 백엔드로 드론 제어 명령어 전송 파이프라인
function sendGcsControlCommand(payload) {
    if (droneSocket && droneSocket.readyState === WebSocket.OPEN) {
        droneSocket.send(payload);
    } else {
        appendGcsTerminalLog("⚠️ [경고] 드론 제어 웹소켓 파이프라인 단선 상태입니다.");
    }
}
// ==========================================
// 💡 [카카오맵 이식] 마우스 무브먼트 인터셉트 - HUD 십자선 및 실시간 지상 좌표 역산
// ==========================================
function setupMapHudInteractions() {
    const wrapper = document.getElementById('cesiumContainer');
    const vLine = document.querySelector('.crosshair-y');
    const hLine = document.querySelector('.crosshair-x');
    const liveCoordsDisplay = document.getElementById('live-coordinates');

    if (!wrapper) return;

    const hudHandler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas);
    
    hudHandler.setInputAction((movement) => {
        if (vLine) { vLine.style.display = 'block'; vLine.style.left = `${movement.endPosition.x}px`; }
        if (hLine) { hLine.style.display = 'block'; hLine.style.top = `${movement.endPosition.y}px`; }

        // 💡 [개선] 흐름 현상을 유발하는 globe.pick 대신 더 안전한 좌표 추출 기법 사용
        let cartesian = window.viewer.scene.pickPosition(movement.endPosition);
        
        if (!Cesium.defined(cartesian)) {
            // 지형 레이어가 없을 때를 대비한 2차 안전 기법(ellipsoid pick)
            const ray = window.viewer.camera.getPickRay(movement.endPosition);
            cartesian = window.viewer.scene.globe.ellipsoid.pickCartesian(ray);
        }

        if (Cesium.defined(cartesian)) {
            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            if (liveCoordsDisplay) {
                liveCoordsDisplay.innerText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    wrapper.addEventListener('mouseleave', () => {
        if (vLine) vLine.style.display = 'none';
        if (hLine) hLine.style.display = 'none';
        if (liveCoordsDisplay) liveCoordsDisplay.innerText = '---.-----, ---.-----';
    });
}

// ==========================================
// 💡 [카카오맵 이식] 빈공간 좌클릭 미션 타겟팅 & 출동 확인 오버레이 윈도우 (Confirm)
// ==========================================


// ==========================================
// 💡 [카카오맵 이식] 일반 지도 / 위성 사진 레이어 변환
// ==========================================
function setupMapLayerSwitcher() {
    const btnVector = document.getElementById('btn-layer-vector');
    const btnSat = document.getElementById('btn-layer-sat');
    if(!btnVector || !btnSat) return;

    const layers = window.viewer.imageryLayers;
    
    btnVector.onclick = () => {
        layers.removeAll();
        layers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            subdomains: ['a', 'b', 'c']
        }));
        btnVector.className = 'layer-btn layer-active';
        btnSat.className = 'layer-btn';
        appendGcsTerminalLog("🗺️ 관제 맵 레이어 변환: 일반 백터 지도 활성화");
    };

    btnSat.onclick = () => {
        layers.removeAll();
        layers.addImageryProvider(Cesium.createWorldImageryAsync());
        btnSat.className = 'layer-btn layer-active';
        btnVector.className = 'layer-btn';
        appendGcsTerminalLog("🛰️ 관제 맵 레이어 변환: 고해상도 위성 사진 활성화");
    };
}
// ==========================================
// 동적 실시간 드론 기체 모델 배치 및 3D 지형 경로 선 그리기
// ==========================================
function streamDroneLivePosition(lon, lat, alt) {
    const droneCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, alt);

    if (!realDroneMarker) {
        realDroneMarker = window.viewer.entities.add({
            position: droneCartesian,
            point: { pixelSize: 18, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: '🚀 관제 드론', font: 'bold 12px sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
    } else {
        realDroneMarker.position.setValue(droneCartesian);
    }

    pathPositionsArray.push(droneCartesian);
    if (!flightPathPolyline) {
        flightPathPolyline = window.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => pathPositionsArray, false),
                width: 4,
                material: Cesium.Color.fromCssColorString('#38bdf8'),
                clampToGround: true 
            }
        });
    }

    // 💡 [중복 비행 차단] 최초 1회만 드론 위치로 카메라 수직 정렬 연동 처리
    if (window.isFirstLocation === true) {
        window.isFirstLocation = false; // 다른 패킷이 오기 전에 최우선으로 잠금
        flyToGcsStandardView(lon, lat);
    }
}

// ==========================================
// 웹소켓 통신 게이트웨이 연동
// ==========================================
function connectGcsNetworkWebSockets() {
    const host = window.location.host;
    
    droneSocket = new WebSocket(`ws://${host}/ws/drone`);
    droneSocket.onopen = () => {
        const connTxt = document.getElementById('txt-connection');
        if (connTxt) { connTxt.innerText = "연결 완료 🟢"; connTxt.style.color = "#10b981"; }
        appendGcsTerminalLog("📡 드론 제어 코어 웹소켓 파이프라인 연결 완료.");
    };
    // cesium_marker.js 내에서 이 부분을 찾아 통째로 교체하세요.
    droneSocket.onmessage = (event) => {
        const packet = JSON.parse(event.data);
        if (packet.type === "DRONE_TELEMETRY" || packet.type === "GLOBAL_POSITION_INT") {
            const telemetry = packet.data;
            
            // 💡 [최종 핵심 가드] 위도(lat)와 경도(lon)가 숫자가 아니거나 0인 쓰레기 데이터는 완전히 차단합니다.
            if (!telemetry || !telemetry.lon || !telemetry.lat || telemetry.lon === 0 || telemetry.lat === 0) {
                return; // 유효하지 않은 데이터가 오면 카메라나 지도를 절대 건드리지 않고 즉시 리턴
            }
            
            // 데이터가 확실히 유효할 때만 UI 및 지도 동기화 진행
            if (document.getElementById('txt-alt')) document.getElementById('txt-alt').innerText = (telemetry.alt || 0).toFixed(1);
            if (document.getElementById('txt-mode')) document.getElementById('txt-mode').innerText = telemetry.mode || "GUIDED";
            if (document.getElementById('txt-battery')) document.getElementById('txt-battery').innerText = `${telemetry.battery || 100}%`;
            
            // 실시간 드론 위치 렌더링 및 최초 1회 정렬 호출
            streamDroneLivePosition(telemetry.lon, telemetry.lat, telemetry.alt || 0);
        }
    };
    droneSocket.onclose = () => {
        const connTxt = document.getElementById('txt-connection');
        if (connTxt) { connTxt.innerText = "연결 끊김 🔴"; connTxt.style.color = "#ef4444"; }
        setTimeout(connectGcsNetworkWebSockets, 3000);
    };

    chatSocket = new WebSocket(`ws://${host}/ws/chat`);
    chatSocket.onmessage = (event) => {
        appendGcsTerminalLog(`${event.data}`, true);
    };
}
// GCS 통합 관제 기지국 엔진 초기화 함수 (총괄)
function runGcsControlStationEngine() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const contextMenu = document.getElementById('customContextMenu');
    const homeWidget = document.getElementById('gcsHomeWidget');

    // 패널 버튼 제어 명령 연결
    if(document.getElementById('btn-connect')) document.getElementById('btn-connect').onclick = () => { sendGcsControlCommand(`CONNECT:${document.getElementById('connect-string').value}`); };
    if(document.getElementById('btn-disconnect')) document.getElementById('btn-disconnect').onclick = () => { sendGcsControlCommand("DISCONNECT"); };
    if(document.getElementById('btn-arm')) document.getElementById('btn-arm').onclick = () => { sendGcsControlCommand("ARM"); };
    if(document.getElementById('btn-disarm')) document.getElementById('btn-disarm').onclick = () => { sendGcsControlCommand("DISARM"); };
    if(document.getElementById('btn-takeoff')) document.getElementById('btn-takeoff').onclick = () => { sendGcsControlCommand("TAKEOFF"); };
    if(document.getElementById('btn-land')) document.getElementById('btn-land').onclick = () => { sendGcsControlCommand("LAND"); };

    const dispatchGcsChatMessage = () => {
        const input = document.getElementById('chat-message-input');
        if (!input || !input.value.trim()) return;
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.send(input.value.trim());
            input.value = "";
        }
    };
    if(document.getElementById('btn-chat-send')) document.getElementById('btn-chat-send').onclick = dispatchGcsChatMessage;
    if(document.getElementById('chat-message-input')) document.getElementById('chat-message-input').onkeypress = (e) => { if(e.key === 'Enter') dispatchGcsChatMessage(); };

    // =========================================================================
    // 🏠 [완벽 교정] 프로그램 재접속 시 사용자가 마지막으로 변경한 홈 위치를 자동 복구
    // =========================================================================
    function verifySavedInitialHomeCoords() {
        if (!window.viewer || !window.viewer.entities) {
            setTimeout(verifySavedInitialHomeCoords, 200);
            return;
        }

        // ❌ [원인 제거] 무조건 캐시를 초기화하던 기존 코드를 완전히 제거합니다.
        // localStorage.removeItem('gcs_saved_home');

        // 💡 [핵심 로직] 저장된 캐시 정보가 있다면 그대로 가져오고, 완전히 처음 접속한 경우에만 디폴트 좌표를 씁니다.
        const cached = localStorage.getItem('gcs_saved_home');
        if (cached) {
            window.homeCoords = JSON.parse(cached);
        } else {
            // 최초 실행 시 기본 관제 홈 좌표 설정 (서울 관악구 인근)
            window.homeCoords = { lon: 126.9186, lat: 37.4617 }; 
            localStorage.setItem('gcs_saved_home', JSON.stringify(window.homeCoords));
        }
        
        // 지도 위에 기존 홈마커 찌꺼기가 남아있다면 깨끗하게 지우기
        if (window.homeMarker) {
            window.viewer.entities.remove(window.homeMarker);
        }
        
        // 🏠 새로 판단된(또는 캐시에서 복구된) 위치에 청록색 홈 기지 마커 생성
        window.homeMarker = window.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(window.homeCoords.lon, window.homeCoords.lat, 0),
            point: { pixelSize: 16, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLUE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: '🏠 HOME', font: 'bold 12px sans-serif', fillColor: Cesium.Color.CYAN, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
        
        // 상단 스코프 변수 동기화 바인딩
        homeMarker = window.homeMarker;
        homeCoords = window.homeCoords;
        
        // 💡 최초 진입 시 최종 저장되어 있던 홈 위치로 맵 카메라를 고정 비행 정렬합니다.
        if (window.isFirstLocation === true) {
            window.isFirstLocation = false; // 웹소켓 폭주 방지용 선제적 잠금
            flyToGcsStandardView(window.homeCoords.lon, window.homeCoords.lat);
        }
    }

    verifySavedInitialHomeCoords();
    setupMapHudInteractions();
    setupMapLayerSwitcher();
    connectGcsNetworkWebSockets();

    // 주소 통합 실시간 검색 연동
    async function triggerGcsSearchQuery() {
        const textValue = searchInput.value.trim();
        if (!textValue) return alert("검색할 주소지를 입력하세요.");
        try {
            const res = await fetch(`http://${window.location.host}/api/gcs/search?query=${encodeURIComponent(textValue)}`);
            const data = await res.json();
            if (data.status === 'OK') {
                if (searchMarker) window.viewer.entities.remove(searchMarker);
                searchMarker = window.viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(data.lon, data.lat, 0),
                    point: { pixelSize: 14, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
                    label: { text: textValue, font: 'bold 14px sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY }
                });
                flyToGcsStandardView(data.lon, data.lat);
                appendGcsTerminalLog(`🔎 실시간 주소 추적 검색 성공: ${textValue}`);
            } else { alert("검색 결과를 매핑하지 못했습니다."); }
        } catch(e) { alert("백엔드 라우터 단선 오류"); }
    }
    if(searchButton) searchButton.onclick = triggerGcsSearchQuery;
    if(searchInput) searchInput.onkeypress = (e) => { if(e.key === 'Enter') triggerGcsSearchQuery(); };

    // =========================================================================
    // 🚨 [브라우저 가드] 브라우저 자체 우클릭 창(윈도우 메뉴)이 뜨는 것을 원천 봉쇄
    // =========================================================================
    if (window.viewer && window.viewer.scene && window.viewer.scene.canvas) {
        window.viewer.scene.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // 윈도우 기본 팝업 강제 차단
        });
    }

    // =========================================================================
    // 🎯 [2D 모드 완벽 대응] 지도 위 우클릭 좌표 추출, 카메라 연동 이동 및 메뉴 팝업 엔진
    // =========================================================================
    try {
        const rightHandler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas);
        rightHandler.setInputAction((mov) => {
            if (!window.viewer) return;
            
            const ctxMenu = document.getElementById('customContextMenu');
            if (!ctxMenu) return;

            // 1차 시도: 마커나 기체 오브젝트를 우클릭했는지 체크
            const picked = window.viewer.scene.pick(mov.position);
            let cartesian = null;

            if (Cesium.defined(picked) && picked.id && picked.id.position) {
                cartesian = picked.id.position.getValue(window.viewer.clock.currentTime);
            } else {
                // 2차 시도: 💡 [2D 최적화] 3D 함수들을 모두 배제하고 2D 평면 맵에서 100% 성공하는 카메라 타원체 픽킹 기법 사용
                cartesian = window.viewer.scene.camera.pickEllipsoid(mov.position, window.viewer.scene.globe.ellipsoid);
            }
            
            // 좌표를 확실히 확보한 경우에만 비즈니스 로직 가동
            if (Cesium.defined(cartesian)) {
                clickedPosition = cartesian;

                // 1. 🎯 [상대 좌표 연산] 부모 래퍼 내부의 마우스 클릭 픽셀 자리에 메뉴 즉시 배치
                ctxMenu.style.left = `${mov.position.x}px`; 
                ctxMenu.style.top = `${mov.position.y}px`; 
                ctxMenu.style.display = 'block';

                // 2. 🗺️ [카메라 이동] 우클릭한 지점이 화면 정중앙에 오도록 지도 부드럽게 이동
                const carto = Cesium.Cartographic.fromCartesian(clickedPosition);
                const lon = Cesium.Math.toDegrees(carto.longitude);
                const lat = Cesium.Math.toDegrees(carto.latitude);
                
                // 기존 가이드라인 잠금 규칙에 따라 안전하게 이동 호출
                flyToGcsStandardView(lon, lat);
            } else { 
                ctxMenu.style.display = 'none'; 
            }
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

        // 💡 [안전장치] 지도 빈 곳 좌클릭하면 열려있던 우클릭 커스텀 메뉴 숨기기
        const leftHandlerForClose = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas);
        leftHandlerForClose.setInputAction(() => {
            const ctxMenu = document.getElementById('customContextMenu');
            if (ctxMenu) ctxMenu.style.display = 'none';
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    } catch (e) { console.warn("우클릭 가드 작동 실패", e); }

    // 엘리먼트 안전 바인딩 유틸 함수
    const bindSafeClickEvent = (id, actionFunc) => {
        const element = document.getElementById(id);
        if (element) { element.onclick = actionFunc; }
    };

    // 🎯 [기능 통합] 우클릭 메뉴 1: 출동지시 (기존 좌클릭 소방 지령 로직 완벽 이식)
    bindSafeClickEvent('menuSetTarget', async () => {
        if (!clickedPosition) return;
        const ctxMenu = document.getElementById('customContextMenu');
        if (ctxMenu) ctxMenu.style.display = 'none'; // 메뉴 닫기

        const carto = Cesium.Cartographic.fromCartesian(clickedPosition);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        
        // 타겟 마커 배치
        if (targetMarker) window.viewer.entities.remove(targetMarker);
        window.targetMarker = window.viewer.entities.add({
            position: clickedPosition,
            point: { pixelSize: 16, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: '🎯 TARGET', font: 'bold 12px sans-serif', fillColor: Cesium.Color.RED, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
        targetMarker = window.targetMarker;
        
        if (document.getElementById('target-coords')) document.getElementById('target-coords').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if (document.getElementById('target-coords-display')) document.getElementById('target-coords-display').innerText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        
        flyToGcsStandardView(lon, lat);

        // 🚨 [경로선 연동 추가] 기존 미션 경로점 배열 초기화 후 첫 가이드 실선 매핑 실행
        window.missionWaypoints = [];
        refreshMissionVisualPath();

        let addressTextStr = "확인 불가 지역 (산악/보안 공간)";
        try {
            const response = await fetch(`http://${window.location.host}/api/gcs/search?query=${lat.toFixed(5)},${lon.toFixed(5)}`);
            const addrResult = await response.json();
            if (addrResult.status === 'OK') addressTextStr = addrResult.display_name;
        } catch(e) {}

        if (confirm(`🚀 [소방 드론 긴급 출동 지령 요청]\n\n현장 위치: ${addressTextStr}\n좌표 정보: ${lat.toFixed(5)}, ${lon.toFixed(5)}\n\n해당 타겟으로 시동(ARM) 및 즉시 드론 기체 출동을 승인하시겠습니까?`)) {
            sendGcsControlCommand("ARM");
            appendGcsTerminalLog("🚀 출동 명령 승인 하달: 백엔드로 기체 시동(ARM) 패킷 신호를 발송했습니다.");
        }
    });

    // 🎯 우클릭 메뉴 2: 홈설정
    bindSafeClickEvent('menuSetHome', () => {
        if (!clickedPosition) return;
        const ctxMenu = document.getElementById('customContextMenu');
        if (ctxMenu) ctxMenu.style.display = 'none'; // 메뉴 닫기

        const carto = Cesium.Cartographic.fromCartesian(clickedPosition);
        homeCoords = { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude) };
        localStorage.setItem('gcs_saved_home', JSON.stringify(homeCoords));
        
        if (homeMarker) window.viewer.entities.remove(homeMarker);
        homeMarker = window.viewer.entities.add({
            position: clickedPosition,
            point: { pixelSize: 16, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLUE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: '🏠 HOME', font: 'bold 12px sans-serif', fillColor: Cesium.Color.CYAN, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
        flyToGcsStandardView(homeCoords.lon, homeCoords.lat);
        appendGcsTerminalLog("🏠 기지 홈 위치 리프레시 수동 재지정 완료");
    });
    // runGcsControlStationEngine() 함수 내부 맨 아래쪽에 배치하세요.
    verifySavedInitialHomeCoords();
    setupMapHudInteractions();
    setupMapLeftClickMission();
    setupMapLayerSwitcher();
    connectGcsNetworkWebSockets();
    
    // 🚨 [추가] + 버튼 좌클릭 매핑 엔진 작동 가동
    setupPlusButtonInteractionEngine();
    
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(runGcsControlStationEngine, 500); });
} else {
    setTimeout(runGcsControlStationEngine, 500);
}