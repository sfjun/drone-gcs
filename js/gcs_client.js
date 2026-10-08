// ==========================================
// gcs_client.js - 메인 관제 웹소켓 및 UI 로직 (통합 완결본)
// ==========================================

function updateEventLog(message) {
    const logElement = document.getElementById('single-event-log');
    if (logElement) {
        const now = new Date();
        const time = String(now.getHours()).padStart(2, '0') + ':' + 
                     String(now.getMinutes()).padStart(2, '0') + ':' + 
                     String(now.getSeconds()).padStart(2, '0');
        
        logElement.textContent = `[${time}] ${message}`;
        logElement.style.color = '#ffffff';
        setTimeout(() => { logElement.style.color = '#38bdf8'; }, 300);
    }
}

function addChatLog(htmlContent) {
    const chatLog = document.getElementById("chat-log-area");
    if (!chatLog) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    chatLog.innerHTML += `[${timeStr}] ${htmlContent}<br>`;
    chatLog.scrollTop = chatLog.scrollHeight;
}

function sendChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    if (!isConnected || !ws) {
        alert("서버와 연결되어 있지 않습니다.");
        return;
    }

    addChatLog(`💬 <b style="color:#10b981;">[관제사]</b> ${msg}`);

    const packet = { action: "CHAT", message: msg };
    ws.send(JSON.stringify(packet));
    input.value = "";
}

let ws = null;
let isConnected = false;
window.pendingFlyTo = false; // 고도 도달 대기 상태 플래그

function connectWebSocket() {
    if (isConnected) return;
    
    // 소방차 화면(input 없는 경우)을 위한 기본 IP 세팅 방어 로직
    let ipVal = "udp:0.0.0.0:14550"; 
    const ipInput = document.getElementById("ip-input");
    if (ipInput) {
        ipVal = ipInput.value.trim();
        if (!ipVal) return updateEventLog("⚠️ 연결 주소를 입력하세요.");
    }

    updateEventLog("📡 서버로 웹소켓 연결 시도 중...");
    
    if (ws !== null) {
        ws.close();
        ws = null;
    }

    // 웹소켓 주소 자동 분기
    if (window.location.pathname.includes('/car')) {
        ws = new WebSocket(`ws://${window.location.host}/ws/car/drone`);
        console.log("🚒 출동 소방차 웹소켓 연결 시도");
    } else {
        ws = new WebSocket(`ws://${window.location.host}/ws/drone`);
        console.log("🖥 관제 센터 웹소켓 연결 시도");
    }

    ws.onopen = function() {
        isConnected = true;
        updateEventLog("🟢 백엔드 웹소켓 연결 완료! 드론 연결을 시도합니다...");
        
        const statusLabel = document.getElementById("status-label");
        if (statusLabel) {
            statusLabel.innerText = `상태: 서버 연결됨 🟢`;
            statusLabel.style.color = "#a6e3a1";
        }
        
        const btnConnect = document.getElementById("btn-connect");
        const btnDisconnect = document.getElementById("btn-disconnect");
        if (btnConnect) btnConnect.disabled = true;
        if (btnDisconnect) btnDisconnect.disabled = false;
        
        ws.send("CONNECT:" + ipVal);
    };

    ws.onmessage = function(event) {
        try {
            const msg = JSON.parse(event.data);
            
            if (msg.type === "LOG") {
                updateEventLog(`[DRONE] ${msg.data}`);
            } 
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
            else if (msg.type === "MODE") {
                const modeEl = document.getElementById("status-mode");
                if (modeEl) modeEl.innerText = msg.data;
            }
            else if (msg.type === "GPS") {
                const altRelEl = document.getElementById("status-alt-rel");
                const altMslEl = document.getElementById("status-alt-msl");
                
                if (altRelEl && altMslEl) {
                    // 1. 상대 고도 처리 (노이즈 보정 포함)
                    let currentAlt = msg.data.alt;
                    if (currentAlt < 0 && currentAlt > -0.5) {
                        currentAlt = 0.0;
                    }
                    
                    // 2. 해발 고도 처리 (안전망 추가)
                    let mslAlt = msg.data.msl_alt !== undefined ? msg.data.msl_alt : 0.0;

                    // 3. UI 업데이트
                    altRelEl.innerText = currentAlt.toFixed(1) + " m";
                    altMslEl.innerText = mslAlt.toFixed(1) + " m";
                }
                
                const gpsText = document.getElementById("status-gps");
                if (gpsText) {
                    gpsText.innerText = `${msg.data.lat.toFixed(5)}, ${msg.data.lon.toFixed(5)}`;
                }

                // 우측 하단 CUR 실시간 좌표 표시 반영
                const liveCoords = document.getElementById("live-coordinates");
                if (liveCoords) {
                    liveCoords.innerText = `${msg.data.lat.toFixed(5)}, ${msg.data.lon.toFixed(5)}`;
                }

                // VWorld 지도(vmap) 위에서 드론 위치 마커 이동 연동
                if (msg.data.lat !== 0 && msg.data.lon !== 0) {
                    if (typeof moveMarker === "function") {
                        // ✨ 수정: lat, lon 뒤에 msg.data.hdg 를 추가로 넘겨줍니다. ✨
                        moveMarker(msg.data.lat, msg.data.lon, msg.data.hdg);
                    }
                }

                // ✨ 목표 고도 도달 감지 로직 (9.5m -> 48.0m로 넉넉하게 변경)
                if (window.pendingFlyTo && msg.data.alt >= 48.0) {
                    window.pendingFlyTo = false; // 중복 실행 방지
                    if (window.targetWaypoint && window.targetWaypoint.lat) {
                        const lat = window.targetWaypoint.lat;
                        const lon = window.targetWaypoint.lon;
                        updateEventLog(`🎯 [출동 3단계] 고도 확보 완료! 목표 지점(${lat.toFixed(5)}, ${lon.toFixed(5)})으로 자동 비행합니다!`);
                        sendCommand(`FLY_TO:${lat},${lon}`);
                    }
                }
            }
            else if (msg.type === "BATTERY") {
                const batteryText = document.getElementById("status-battery");
                if (batteryText) {
                    batteryText.innerText = msg.data + "%"; 
                }
            }
            else if (msg.type === "EKF_STATUS") {
                const sysStatusEl = document.getElementById("telemetry-sys-status");
                if (sysStatusEl) {
                    sysStatusEl.innerText = msg.data;
                    if (msg.data === "READY") {
                        sysStatusEl.style.color = "#10b981"; // 초록색
                    } else {
                        sysStatusEl.style.color = "#FFC107"; // 노란색
                    }
                }
            }

            if (msg.type === "AI_EVENT") {
                const aiData = msg.data;

                // 1. 하단 자막(HUD) 띄우기
                const hudAlert = document.getElementById('hud-alert');
                const hudText = document.getElementById('hud-alert-text');
                
                if (hudAlert && hudText) {
                    hudText.innerText = aiData.msg;
                    hudAlert.classList.add('active');

                    if (window.hudTimer) clearTimeout(window.hudTimer);
                    window.hudTimer = setTimeout(() => {
                        hudAlert.classList.remove('active');
                    }, 3000);
                }

                // 2. ✨ 감지된 사람 위치에 말풍선(태그) 띄우기
                const videoContainer = document.querySelector('.video-container');
                
                // 기존에 있던 말풍선들 전부 청소
                document.querySelectorAll('.ai-person-tag').forEach(el => el.remove());

                if (aiData.coordinates && aiData.coordinates.length > 0) {
                    aiData.coordinates.forEach((person, index) => {
                        // 라즈베리파이 카메라 해상도(640x480 기준)를 현재 비디오 렌더링 크기에 맞게 비율 계산
                        const canvas = document.getElementById('video-canvas');
                        if (!canvas) return;

                        const rect = canvas.getBoundingClientRect();
                        const scaleX = rect.width / 640;
                        const scaleY = rect.height / 480;

                        // 중심 좌표 또는 박스 상단 좌표 계산
                        let posX = 320;
                        let posY = 240;

                        if (person.center && person.center.length === 2) {
                            posX = person.center[0] * scaleX;
                            posY = person.center[1] * scaleY - 15; // 박스 위쪽으로 살짝 올림
                        } else if (person.box_2d && person.box_2d.length === 4) {
                            // [x1, y1, x2, y2] 중 상단 중앙
                            posX = ((person.box_2d[0] + person.box_2d[2]) / 2) * scaleX;
                            posY = person.box_2d[1] * scaleY;
                        }

                        // 말풍선 엘리먼트 생성
                        const tag = document.createElement('div');
                        tag.className = 'ai-person-tag';
                        tag.style.left = `${posX}px`;
                        tag.style.top = `${posY}px`;
                        tag.innerText = `👤 사람 (${(person.confidence * 100).toFixed(0)}%)`;

                        videoContainer.appendChild(tag);
                    });

                    // 3초 뒤에 말풍선도 함께 사라지도록 설정
                    setTimeout(() => {
                        document.querySelectorAll('.ai-person-tag').forEach(el => el.remove());
                    }, 3000);
                }
            }
            
            else if (msg.type === "VIDEO" || msg.type === "VIDEO_FRAME") {
                const canvas = document.getElementById('video-canvas');
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = () => {
                    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
                    if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
                    
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    const hRatio = canvas.width / img.width;
                    const vRatio = canvas.height / img.height;
                    const ratio  = Math.min(hRatio, vRatio);
                    
                    const centerShift_x = (canvas.width - img.width * ratio) / 2;
                    const centerShift_y = (canvas.height - img.height * ratio) / 2;  
                    
                    ctx.drawImage(img, 0, 0, img.width, img.height,
                                  centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
                };
                img.src = "data:image/jpeg;base64," + msg.data;
            }
            else if (msg.type === "AI_RISK") {
                const fireEl = document.getElementById('risk-fire');
                if (fireEl) fireEl.style.width = msg.data.fire + '%';
                const smokeEl = document.getElementById('risk-smoke');
                if (smokeEl) smokeEl.style.width = msg.data.smoke + '%';
                const personEl = document.getElementById('risk-person');
                if (personEl) personEl.style.width = msg.data.person + '%';
                const hotspotEl = document.getElementById('risk-hotspot');
                if (hotspotEl) hotspotEl.style.width = msg.data.hotspot + '%';
            }
        } catch (e) {}
    };

    ws.onerror = () => updateEventLog("❌ 웹소켓 에러 발생.");
    
    ws.onclose = () => {
        isConnected = false;
        ws = null; 
        
        const statusLabel = document.getElementById("status-label");
        if (statusLabel) {
            statusLabel.innerText = "상태: 연결 끊김 🔴";
            statusLabel.style.color = "#f38ba8";
        }
        
        const btnConnect = document.getElementById("btn-connect");
        const btnDisconnect = document.getElementById("btn-disconnect");
        if (btnConnect) btnConnect.disabled = false;
        if (btnDisconnect) btnDisconnect.disabled = true;
        updateEventLog("🔴 서버와의 웹소켓 연결이 해제되었습니다.");
        drawStandbyFrame("WAITING FOR SIGNAL..."); 
    };
}

function disconnectWebSocket() {
    if (ws && isConnected) {
        updateEventLog("🔌 드론 연결 해제를 요청했습니다.");
        ws.send("DISCONNECT");
        
        setTimeout(() => {
            if (ws) {
                ws.close();
                ws = null;
            }
        }, 100);

        if (typeof flightPath !== "undefined") {
            flightPath.setPath([]); 
        }
    }
}

function sendCommand(command) {
    if (!isConnected || !ws) return updateEventLog("명령 불가: 서버와 연결되지 않았습니다.");
    ws.send(command);
}

function drawStandbyFrame(text) {
    const canvas = document.getElementById('video-canvas');
    if (!canvas) return;
    
    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
    if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Consolas"';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function initAutoConnect() {
    drawStandbyFrame("WAITING FOR SIGNAL...");
    if (window.location.pathname.includes('/car')) {
        setTimeout(() => {
            console.log("🚒 소방차 화면 자동 연결 실행");
            connectWebSocket();
        }, 1000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initAutoConnect);
} else {
    initAutoConnect();
}

// ==========================================
// 자동 출동 (지도 이동 + 예정 경로 + ARM -> TAKEOFF -> 고도 도달 시 FLY_TO)
// ==========================================
window.dispatchDrone = function() {
    if (!isConnected || !ws) {
        updateEventLog("⚠️ 기체와 연결되지 않았습니다. '연결 시작'을 먼저 눌러주세요.");
        return;
    }
    if (!window.targetWaypoint || !window.targetWaypoint.lat) {
        updateEventLog("⚠️ 목표 지점이 설정되지 않았습니다.");
        return;
    }

    // 1. 지도 화면을 현재 드론 위치로 스무스하게 이동
    if (typeof map !== 'undefined' && typeof droneFeature !== 'undefined') {
        var droneCoord = droneFeature.getGeometry().getCoordinates();
        map.getView().animate({ center: droneCoord, zoom: 19, duration: 800 });
        
        // 2. 예정 경로 그리기
        var targetCoord = ol.proj.fromLonLat([window.targetWaypoint.lon, window.targetWaypoint.lat]);
        if (typeof window.drawPlannedPath === 'function') {
            window.drawPlannedPath(droneCoord, targetCoord);
        }
    }

    // ✨ 핵심 수정 1: 현재 고도를 확인하여 비행 중(3m 이상)일 때의 로직 ✨
    const altEl = document.getElementById("status-alt");
    const currentAlt = altEl ? parseFloat(altEl.innerText) : 0;

    if (currentAlt > 3.0) {
        if (currentAlt < 48.0) {
            // 1단계: 고도가 낮으면 제자리에서 50m로 먼저 수직 상승
            updateEventLog("🎯 [재출동] 제자리에서 안전 고도(50m)로 먼저 수직 상승합니다.");
            
            // [수정된 부분] TAKEOFF 명령 대신, 드론의 현재 위치로 FLY_TO 명령을 보내 제자리 상승 유도
            const gpsText = document.getElementById("status-gps").innerText;
            const curCoords = gpsText.split(",");
            const curLat = parseFloat(curCoords[0]);
            const curLon = parseFloat(curCoords[1]);
            
            sendCommand(`FLY_TO:${curLat},${curLon}`);
            
            window.pendingFlyTo = true; // 50m 도달 시 진짜 목표 지점으로 이동하도록 락 걸기
        } else {
            // 2단계: 이미 50m 부근이라면 즉시 목표 지점으로 이동
            updateEventLog("🎯 [재출동] 안전 고도 확보됨. 새 목표 지점으로 즉시 이동합니다.");
            const lat = window.targetWaypoint.lat;
            const lon = window.targetWaypoint.lon;
            sendCommand(`FLY_TO:${lat},${lon}`);
        }
        return; // 아래의 시동 및 이륙 로직을 건너뜀
    }

    // ✨ 핵심 수정 2: 바닥에 있을 경우 GUIDED 모드로 강제 전환 후 시동 ✨
    updateEventLog("⚙️ [출동 준비] 비행 모드를 GUIDED로 변경합니다.");
    sendCommand('GUIDED');

    setTimeout(() => {
        updateEventLog("🚀 [출동 1단계] 기체 시동(ARM) 명령을 전송합니다.");
        sendCommand('ARM');
    }, 1500);

    // ✨ 핵심 수정 3: 시동 후 안정화 대기 시간 및 메시지 변경
    setTimeout(() => {
        updateEventLog("🚁 [출동 2단계] 이륙(TAKEOFF 50m) 명령을 전송합니다.");
        sendCommand('TAKEOFF');
        window.pendingFlyTo = true;
        updateEventLog("⏳ 이륙 중... 목표 고도(50m) 도달을 대기합니다.");
    }, 5000);
};