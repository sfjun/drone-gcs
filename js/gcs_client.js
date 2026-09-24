// ==========================================
// gcs_client.js - 메인 관제 웹소켓 및 UI 로직
// ==========================================

// [수정된 이벤트 로그 표시 함수]
function updateEventLog(message) {
    const logElement = document.getElementById('single-event-log');
    if (logElement) {
        const now = new Date();
        const time = String(now.getHours()).padStart(2, '0') + ':' + 
                     String(now.getMinutes()).padStart(2, '0') + ':' + 
                     String(now.getSeconds()).padStart(2, '0');
        
        // 텍스트를 누적하지 않고 통째로 덮어씌움 (최신 1줄만 유지)
        logElement.textContent = `[${time}] ${message}`;
        
        // (선택) 새 로그가 뜰 때 글씨 색상을 잠깐 깜빡이게 하는 효과
        logElement.style.color = '#ffffff';
        setTimeout(() => {
            logElement.style.color = '#38bdf8';
        }, 300);
    }
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
function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (!isConnected || !ws) {
        alert("서버와 연결되어 있지 않습니다.");
        return;
    }

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
    if (!ipVal) return updateEventLog("⚠️ 연결 주소를 입력하세요.");

    updateEventLog("📡 서버로 웹소켓 연결 시도 중...");
    
    // ⭐️ 이전 소켓이 남아있다면 강제로 닫고 완전 초기화
    if (ws !== null) {
        ws.close();
        ws = null;
    }

    // gcs_client.js 수정 전 [4]
    // ws = new WebSocket(`ws://${window.location.host}/ws/drone`);

    // 🔄 gcs_client.js 수정 후 (주소창 경로를 감지하여 웹소켓 분기)
    // 현재 웹 브라우저 주소창의 경로(pathname)가 '/car'를 포함하고 있는지 확인합니다.
    if (window.location.pathname.includes('/car')) {
        // 🚒 서브 화면(출동 소방차)일 때는 /ws/car/drone 경로로 연결
        ws = new WebSocket(`ws://${window.location.host}/ws/car/drone`);
        console.log("🚒 출동 소방차 웹소켓 채널로 연결합니다. (/ws/car/drone)");
    } else {
        // 🖥️ 초기 화면(소방 관제 센터)일 때는 원래대로 /ws/drone 경로로 연결
        ws = new WebSocket(`ws://${window.location.host}/ws/drone`);
        console.log("🖥️ 소방 관제 센터 웹소켓 채널로 연결합니다. (/ws/drone)");
    }

    ws.onopen = function() {
        isConnected = true;
        updateEventLog("🟢 백엔드 웹소켓 연결 완료! 드론 연결을 시도합니다...");
        document.getElementById("status-label").innerText = `상태: 서버 연결됨 🟢`;
        document.getElementById("status-label").style.color = "#a6e3a1";
        document.getElementById("btn-connect").disabled = true;
        document.getElementById("btn-disconnect").disabled = false;
        
        ws.send("CONNECT:" + ipVal);
    };

    ws.onmessage = function(event) {
        try {
            const msg = JSON.parse(event.data);

            console.log("서버로부터 받은 데이터 타입:", msg.type);
            
            if (msg.type === "LOG") {
                if (typeof updateEventLog === "function") updateEventLog(`[DRONE] ${msg.data}`);
            } 
            else if (msg.type === "CHAT" || msg.type === "VIDEO_CHAT") {
                if (typeof addChatLog === "function") addChatLog(`💬 <b>[${msg.data.name || "User"}]</b> ${msg.data.message}`);
            }
            else if (msg.type === "SYSTEM_MESSAGE") {
                let levelColor = "#38bdf8";
                if (msg.data.level === "WARNING") levelColor = "#facc15";
                if (msg.data.level === "DANGER" || msg.data.level === "ERROR") levelColor = "#ef4444";
                if (typeof addChatLog === "function") addChatLog(`<span style="color: ${levelColor};">[SYS] ${msg.data.message}</span>`);
            }
            else if (msg.type === "CHAT_ALERT") {
                if (typeof addChatLog === "function") addChatLog(`🚨 <span style="color: #ef4444; font-weight: bold;">[ALERT] ${msg.data.message}</span>`);
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
                
                if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
                if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
                
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
        } catch (e) {
            console.error("JSON 파싱 에러:", e);
        }
    };

    ws.onerror = () => updateEventLog("❌ 웹소켓 에러 발생.");
    
    ws.onclose = () => {
        isConnected = false;
        ws = null; // ⭐️ 재연결을 위해 객체를 완벽히 비워줌
        
        document.getElementById("status-label").innerText = "상태: 연결 끊김 🔴";
        document.getElementById("status-label").style.color = "#f38ba8";
        document.getElementById("btn-connect").disabled = false;
        document.getElementById("btn-disconnect").disabled = true;
        updateEventLog("🔴 서버와의 웹소켓 연결이 해제되었습니다.");
        drawStandbyFrame("WAITING FOR SIGNAL..."); 
    };
}

function disconnectWebSocket() {
    if (ws && isConnected) {
        updateEventLog("🔌 드론 연결 해제를 요청했습니다.");
        
        // 서버로 해제 신호 전송
        ws.send("DISCONNECT");
        
        // ⭐️ 서버가 DISCONNECT 메시지를 정상적으로 수신할 수 있도록 아주 짧은 딜레이 후 소켓 종료
        setTimeout(() => {
            if (ws) {
                ws.close();
                ws = null;
            }
        }, 100);

        // map_manager.js에 선언된 flightPath 객체 접근
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

// 초기 로딩 시 스탠바이 화면을 그립니다.
document.addEventListener("DOMContentLoaded", () => {
    drawStandbyFrame("WAITING FOR SIGNAL...");
});

// 버튼 클릭 시 백엔드 API를 호출하는 함수
function launchCarApp() {
    fetch('/open-car-app')
        .then(response => {
            if (!response.ok) throw new Error('서버 연결 실패');
            return response.json();
        })
        .then(data => {
            // 서버가 보낸 리턴 구조와 완벽히 매칭
            if (data && data.status === 'success') {
                console.log("🟢 서버가 단독 앱 창을 정상적으로 실행했습니다.");
            } else {
                alert("앱 실행 실패: " + (data.message || "알 수 없는 오류"));
            }
        })
        .catch(err => {
            console.error("통신 에러:", err);
            alert("서버 통신 실패: " + err.message);
        });
}

