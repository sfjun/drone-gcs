// gcs_client.js
// ==========================================
// 1. 카카오맵 초기화 및 설정
// ==========================================
var mapContainer = document.getElementById('map'); 
var mapOption = { 
    center: new kakao.maps.LatLng(37.46067, 126.91946), // 초기 좌표
    level: 3 // 확대 레벨
};

// 지도 생성
var map = new kakao.maps.Map(mapContainer, mapOption);

// 우측 줌 컨트롤 추가
var zoomControl = new kakao.maps.ZoomControl();
map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

// ==========================================
// 2. 마우스 커서 십자선 및 실시간 좌표 HUD 표시
// ==========================================
var crossX = document.createElement('div');
crossX.className = 'crosshair-x';
var crossY = document.createElement('div');
crossY.className = 'crosshair-y';
mapContainer.appendChild(crossX);
mapContainer.appendChild(crossY);

var liveCoordsText = document.getElementById('live-coordinates');

kakao.maps.event.addListener(map, 'mousemove', function(mouseEvent) {
    var latlng = mouseEvent.latLng;
    liveCoordsText.innerText = latlng.getLat().toFixed(5) + ', ' + latlng.getLng().toFixed(5);
});

kakao.maps.event.addListener(map, 'mouseout', function() {
    liveCoordsText.innerText = '---.-----, ---.-----';
});

// ==========================================
// 3. 드론 마커 및 비행 경로(Polyline) 설정
// ==========================================
var droneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8" width="32" height="32"><path d="M21 10.999h-3.5c-.328-2.029-2.076-3.5-4.167-3.5-1.921 0-3.541 1.258-4.041 3H2.835C1.849 10.499 1 11.312 1 12.333c0 1.02.849 1.833 1.835 1.833H9.29c.498 1.741 2.119 3 4.041 3 2.09 0 3.839-1.471 4.167-3.5H21c1.103 0 2-.897 2-2s-.897-2-2-2zm-7.667 2.833c-1.196 0-2.167-.971-2.167-2.167s.971-2.167 2.167-2.167 2.167.971 2.167 2.167-.971 2.167-2.167 2.167z"/></svg>`;
var droneIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(droneSvg);

var imageSize = new kakao.maps.Size(32, 32); 
var imageOption = {offset: new kakao.maps.Point(16, 16)}; 
var droneMarkerImage = new kakao.maps.MarkerImage(droneIconUrl, imageSize, imageOption);

var droneMarker = new kakao.maps.Marker({
    position: new kakao.maps.LatLng(37.46083, 126.91941),
    image: droneMarkerImage,
    map: map
});

var flightPath = new kakao.maps.Polyline({
    map: map,
    path: [],
    strokeWeight: 3, 
    strokeColor: '#38bdf8',
    strokeOpacity: 0.8,
    strokeStyle: 'solid'
});

// ==========================================
// 4. 지도 클릭 시 타겟 마커(TGT) 생성 및 출동 확인 팝업
// ==========================================
var targetMarker = null; 
window.targetWaypoint = null; 
var dispatchOverlay = null; // 출동 확인 커스텀 오버레이 변수

// ⭐ [추가] 좌표를 주소로 변환해 주는 카카오 지오코더 객체 생성
var geocoder = new kakao.maps.services.Geocoder(); 

// 출동 팝업 닫기 함수 (취소 버튼 용도)
function closeDispatchPopup() {
    if (dispatchOverlay) {
        dispatchOverlay.setMap(null);
    }
    // 팝업이 닫힐 때 주소 검색창 복구
    var searchBar = document.getElementById('address-input');
    if (searchBar && searchBar.parentElement) {
        searchBar.parentElement.style.zIndex = '2';
    }
}

kakao.maps.event.addListener(map, 'click', function(mouseEvent) {        
    var latlng = mouseEvent.latLng; 
    var lat = latlng.getLat();
    var lon = latlng.getLng();

    // 클릭한 위치를 지도 중앙으로 이동
    map.panTo(latlng);

    // 1. 타겟 마커 생성 또는 위치 이동
    if (targetMarker) {
        targetMarker.setPosition(latlng);
    } else {
        targetMarker = new kakao.maps.Marker({
            position: latlng,
            map: map
        });
    }

    window.targetWaypoint = { lat: lat, lon: lon };
    document.getElementById('target-coords').value = lat.toFixed(5) + ", " + lon.toFixed(5);
    addLog(`📍 목표 지점 클릭 설정됨: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);

    // 2. 기존에 열려 있는 출동 팝업이 있다면 제거
    if (dispatchOverlay) {
        dispatchOverlay.setMap(null);
    }

    // 팝업이 열릴 때 주소 검색창 숨기기
    var searchBar = document.getElementById('address-input');
    if (searchBar && searchBar.parentElement) {
        searchBar.parentElement.style.zIndex = '0';
    }

    // ⭐ [핵심 추가] 클릭한 좌표(lon, lat)를 실제 주소로 변환 요청
    geocoder.coord2Address(lon, lat, function(result, status) {
        var addressText = "주소 정보 없음 (산악/해상 등)";
        
        // 주소 변환에 성공했을 경우
        if (status === kakao.maps.services.Status.OK) {
            // 도로명 주소가 있으면 우선 사용, 없으면 지번 주소 사용
            addressText = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
        }

        // 3. 팝업(CustomOverlay) HTML 콘텐츠 생성 (주소 텍스트 추가됨)
        var content = document.createElement('div');
        content.className = 'dispatch-popup';
        content.style.cssText = 'background: #1e293b; color: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #334155; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); text-align: center; min-width: 210px; font-family: inherit; position: relative; z-index: 9999;';
        
        content.innerHTML = `
            <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; color: #38bdf8;">출동 하시겠습니까?</p>
            <div style="font-size: 13px; color: #f8fafc; margin-bottom: 4px; font-weight: bold; word-break: keep-all;">${addressText}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">(위도: ${lat.toFixed(5)}, 경도: ${lon.toFixed(5)})</div>
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button id="btn-popup-arm" style="padding: 6px 14px; background-color: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">출동</button>
                <button style="padding: 6px 14px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;" onclick="closeDispatchPopup()">취소</button>
            </div>
        `;

        // 팝업 내부 이벤트 지도로 전파 차단
        ['click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'].forEach(function(eventType) {
            content.addEventListener(eventType, function(event) {
                event.stopPropagation();
            });
        });

        // 4. 카카오맵 CustomOverlay 띄우기
        dispatchOverlay = new kakao.maps.CustomOverlay({
            position: latlng,
            content: content,
            yAnchor: 1.35,
            zIndex: 9999
        });

        dispatchOverlay.setMap(map);

        // 5. 버튼 이벤트 바인딩
        setTimeout(function() {
            const btnArm = document.getElementById('btn-popup-arm');
            if (btnArm) {
                btnArm.onclick = function() {
                    sendCommand("ARM");
                    addLog("🚀 출동 승인: 기체 시동(ARM)을 요청합니다.");
                    closeDispatchPopup();
                };
            }
        }, 50);
    }); // geocoder 끝
});

// ==========================================
// 5. 드론 위치 실시간 이동
// ==========================================
function moveMarker(lat, lon) {
    var newLatLng = new kakao.maps.LatLng(lat, lon);
    droneMarker.setPosition(newLatLng);
    map.panTo(newLatLng);
    
    var path = flightPath.getPath();
    path.push(newLatLng);
    flightPath.setPath(path);
}

// ==========================================
// 6. 장소/주소 통합 검색 기능 (카카오 API)
// ==========================================
var ps = new kakao.maps.services.Places();

function searchAddress() {
    var query = document.getElementById('address-input').value;
    
    if (!query) {
        alert("검색할 주소나 장소명을 입력해주세요.");
        return;
    }

    ps.keywordSearch(query, function(data, status, pagination) {
        if (status === kakao.maps.services.Status.OK) {
            var coords = new kakao.maps.LatLng(data[0].y, data[0].x);
            var lat = coords.getLat();
            var lon = coords.getLng();

            map.setLevel(3);
            map.setCenter(coords);

            if (typeof targetMarker !== 'undefined' && targetMarker) {
                targetMarker.setPosition(coords);
            } else {
                targetMarker = new kakao.maps.Marker({
                    map: map,
                    position: coords
                });
            }

            window.targetWaypoint = { lat: lat, lon: lon };
            document.getElementById('target-coords').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            addLog(`📍 장소 검색으로 목표 지점 설정됨: ${query} (${data[0].place_name})`);
            
        } else {
            alert("검색 결과가 없습니다. 올바른 주소나 건물명으로 다시 검색해보세요.");
        }
    });
}

// ==========================================
// 7. 웹소켓, 탭 전환 및 UI 유틸리티 로직
// ==========================================

// 서브 탭 전환 함수 (EVENT LOG <-> COMMAND CHAT)
function switchTab(tabName, btnElement) {
    const viewLog = document.getElementById('view-log');
    const viewChat = document.getElementById('view-chat');
    
    if (!viewLog || !viewChat) return;

    // 모든 뷰 숨기기
    viewLog.style.display = 'none';
    viewChat.style.display = 'none';

    // 모든 탭 버튼의 active 클래스 제거
    const buttons = document.querySelectorAll('.sub-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // 선택된 탭 및 뷰 활성화
    if (tabName === 'log') {
        viewLog.style.display = 'flex';
    } else if (tabName === 'chat') {
        viewChat.style.display = 'flex';
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.focus();
    }

    // 클릭한 버튼 활성화
    if (btnElement) {
        btnElement.classList.add('active');
    }
}

function addLog(msg) {
    const logDiv = document.getElementById("log-area");
    if (!logDiv) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    logDiv.innerHTML += `[${timeStr}] ${msg}<br>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

// 채팅창 전용 로그 추가 함수
function addChatLog(htmlContent) {
    const chatLog = document.getElementById("chat-log-area");
    if (!chatLog) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    chatLog.innerHTML += `[${timeStr}] ${htmlContent}<br>`;
    chatLog.scrollTop = chatLog.scrollHeight;
}

// 채팅 전송 함수
// 채팅 전송 함수
function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (!isConnected || !ws) {
        alert("서버와 연결되어 있지 않습니다.");
        return;
    }

    // ⭐ [추가된 부분] 서버 응답을 기다리지 않고 내 화면에 즉시 띄우기
    addChatLog(`💬 <b style="color:#10b981;">[관제사]</b> ${msg}`);

    // 서버로 데이터 전송
    const packet = {
        action: "CHAT",
        message: msg
    };
    ws.send(JSON.stringify(packet));
    
    // 입력창 초기화
    input.value = "";
}

let ws = null;
let isConnected = false;

function connectWebSocket() {
    if (isConnected) return;
    const ipVal = document.getElementById("ip-input").value.trim();
    if (!ipVal) return addLog("⚠️ 연결 주소를 입력하세요.");

    addLog("📡 서버로 웹소켓 연결 시도 중...");
    ws = new WebSocket(`ws://${window.location.host}/ws/drone`);

    ws.onopen = function() {
        isConnected = true;
        addLog("🟢 백엔드 웹소켓 연결 완료! 드론 연결을 시도합니다...");
        document.getElementById("status-label").innerText = `상태: 서버 연결됨 🟢`;
        document.getElementById("status-label").style.color = "#a6e3a1";
        document.getElementById("btn-connect").disabled = true;
        document.getElementById("btn-disconnect").disabled = false;
        
        ws.send("CONNECT:" + ipVal);
    };

    ws.onmessage = function(event) {
        const msg = JSON.parse(event.data);
        
        // 기존 드론 로그 처리
        if (msg.type === "LOG") {
            addLog(`[DRONE] ${msg.data}`);
        } 
        // 채팅 및 시스템 메시지 분기 처리
        else if (msg.type === "CHAT" || msg.type === "VIDEO_CHAT") {
            addChatLog(`💬 <b>[${msg.data.name || "User"}]</b> ${msg.data.message}`);
        }
        else if (msg.type === "SYSTEM_MESSAGE") {
            let levelColor = "#38bdf8";
            if (msg.data.level === "WARNING") levelColor = "#facc15";
            if (msg.data.level === "DANGER" || msg.data.level === "ERROR") levelColor = "#ef4444";
            addChatLog(`<span style="color: ${levelColor};">[SYS] ${msg.data.message}</span>`);
        }
        else if (msg.type === "CHAT_ALERT") {
            addChatLog(`🚨 <span style="color: #ef4444; font-weight: bold;">[ALERT] ${msg.data.message}</span>`);
        }
        // GPS 데이터 처리
        // 변경 후
        // 비행 모드 데이터 처리 추가
        else if (msg.type === "MODE") {
            document.getElementById("mode").innerText = msg.data;
        }
        // GPS 데이터 처리
        else if (msg.type === "GPS") {
            document.getElementById("alt").innerText = msg.data.alt.toFixed(1);
            if (msg.data.lat !== 0 && msg.data.lon !== 0) {
                moveMarker(msg.data.lat, msg.data.lon);
            }
        }
        // 비디오 스트리밍 처리
        else if (msg.type === "VIDEO") {
            const canvas = document.getElementById('video-canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = "data:image/jpeg;base64," + msg.data;
        }
        // AI 위험도 처리
        else if (msg.type === "AI_RISK") {
            document.getElementById('risk-fire').style.width = msg.data.fire + '%';
            document.getElementById('risk-smoke').style.width = msg.data.smoke + '%';
            document.getElementById('risk-person').style.width = msg.data.person + '%';
            document.getElementById('risk-hotspot').style.width = msg.data.hotspot + '%';
        }
    };

    ws.onerror = () => addLog("❌ 웹소켓 에러 발생.");
    
    ws.onclose = () => {
        isConnected = false;
        document.getElementById("status-label").innerText = "상태: 연결 끊김 🔴";
        document.getElementById("status-label").style.color = "#f38ba8";
        document.getElementById("btn-connect").disabled = false;
        document.getElementById("btn-disconnect").disabled = true;
        addLog("🔴 서버와의 웹소켓 연결이 해제되었습니다.");
        drawStandbyFrame("WAITING FOR SIGNAL..."); 
    };
}

function disconnectWebSocket() {
    if (ws && isConnected) {
        addLog("🔌 드론 연결 해제를 요청했습니다.");
        ws.send("DISCONNECT");
        ws.close();
        flightPath.setPath([]); 
    }
}

function sendCommand(command) {
    if (!isConnected || !ws) return addLog("명령 불가: 서버와 연결되지 않았습니다.");
    ws.send(command);
}

function drawStandbyFrame(text) {
    const canvas = document.getElementById('video-canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Consolas"';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

// ==========================================
// 8. 기존 일반/위성 버튼과 카카오맵 연동
// ==========================================
document.getElementById('btn-map-osm').addEventListener('click', function() {
    map.setMapTypeId(kakao.maps.MapTypeId.ROADMAP); 
});

document.getElementById('btn-map-sat').addEventListener('click', function() {
    map.setMapTypeId(kakao.maps.MapTypeId.HYBRID); 
});

window.onload = () => drawStandbyFrame("WAITING FOR SIGNAL...");

// ==========================================
// 9. 카카오맵 마우스 십자선(X, Y 라인) 화면 좌표 기준 추적
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    var mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    var vLine = document.createElement('div');
    vLine.className = 'crosshair-y';
    
    var hLine = document.createElement('div');
    hLine.className = 'crosshair-x';
    
    mapContainer.appendChild(vLine);
    mapContainer.appendChild(hLine);

    mapContainer.addEventListener('mousemove', function(e) {
        vLine.style.display = 'block';
        hLine.style.display = 'block';

        var rect = mapContainer.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        vLine.style.left = x + 'px';
        hLine.style.top = y + 'px';
    });

    mapContainer.addEventListener('mouseleave', function() {
        vLine.style.display = 'none';
        hLine.style.display = 'none';
    });
});

// ==========================================
// 10. 팝업 영역 마우스 커서 강제 복구 처리
// ==========================================
document.addEventListener("mousemove", function(e) {
    var mapContainer = document.getElementById('map');
    var popup = document.querySelector('.dispatch-popup');
    
    if (!mapContainer) return;

    // 만약 마우스가 출동 팝업창 위에 있다면
    if (popup && popup.contains(e.target)) {
        mapContainer.style.cursor = 'default'; // 화살표 커서 강제 적용
        
        // 십자선 가이드라인 숨김 (CSS로도 처리되었지만 스크립트로 이중 보안)
        var xLine = mapContainer.querySelector('.crosshair-x');
        var yLine = mapContainer.querySelector('.crosshair-y');
        if (xLine) xLine.style.display = 'none';
        if (yLine) yLine.style.display = 'none';
    } else {
        // 평소 지도 위에서는 십자 커서 유지
        mapContainer.style.cursor = 'crosshair';
    }
});