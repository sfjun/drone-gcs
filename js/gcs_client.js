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

function connectWebSocket() {
    if (isConnected) return;
    
    // 💡 소방차 화면(input 없는 경우)을 위한 기본 IP 세팅 방어 로직
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
        console.log("🖥️ 관제 센터 웹소켓 연결 시도");
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
                const altEl = document.getElementById("status-alt");
                if (altEl) altEl.innerText = msg.data.alt.toFixed(1) + " m";
                
                const gpsText = document.getElementById("status-gps");
                if (gpsText) {
                    gpsText.innerText = `${msg.data.lat.toFixed(5)}, ${msg.data.lon.toFixed(5)}`;
                }

                if (msg.data.lat !== 0 && msg.data.lon !== 0) {
                    if (typeof moveMarker === "function") {
                        moveMarker(msg.data.lat, msg.data.lon);
                    }
                }
            }
            else if (msg.type === "BATTERY") {
                const batteryText = document.getElementById("status-battery");
                if (batteryText) {
                    batteryText.innerText = msg.data + "%"; 
                }
            }
            else if (msg.type === "VIDEO" || msg.type === "VIDEO_FRAME") {
                const canvas = document.getElementById('video-canvas');
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = () => {
                    // 1. 캔버스의 그리기 영역 해상도를 현재 화면 창 크기에 딱 맞춤
                    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
                    if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
                    
                    // 2. 배경을 검은색으로 칠하기 (레터박스 역할)
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // 3. 원본 영상의 비율을 계산하여 화면 중앙에 찌그러짐 없이(contain) 배치
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

function launchCarApp() {
    fetch('/open-car-app')
        .then(response => {
            if (!response.ok) throw new Error('서버 연결 실패');
            return response.json();
        })
        .then(data => {
            if (data && data.status === 'success') {
                console.log("🟢 단독 앱 창 실행 명령 전송");
            } else {
                alert("앱 실행 실패: " + (data.message || "알 수 없는 오류"));
            }
        })
        .catch(err => {
            alert("서버 통신 실패: " + err.message);
        });
}

// 💡 [핵심] DOM 로딩 상태와 무관하게 100% 실행되도록 보장하는 초기화 로직
function initAutoConnect() {
    drawStandbyFrame("WAITING FOR SIGNAL...");
    // 출동 소방차 화면이면 무조건 1초 뒤 자동 연결
    if (window.location.pathname.includes('/car')) {
        setTimeout(() => {
            console.log("🚒 소방차 화면 자동 연결 실행");
            connectWebSocket();
        }, 1000);
    }
}

// 브라우저가 스크립트를 언제 읽든 무조건 실행되게 강제
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initAutoConnect);
} else {
    initAutoConnect();
}