// ==========================================
// gcs_client.js - 메인 관제 웹소켓 및 UI 로직
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
        
        if (msg.type === "LOG") {
            addLog(`[DRONE] ${msg.data}`);
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
            document.getElementById("mode").innerText = msg.data;
        }
        else if (msg.type === "GPS") {
            document.getElementById("alt").innerText = msg.data.alt.toFixed(1);
            if (msg.data.lat !== 0 && msg.data.lon !== 0) {
                // ⭐ map_manager.js에 있는 함수를 호출해서 지도 마커를 이동시킵니다.
                if (typeof moveMarker === "function") {
                    moveMarker(msg.data.lat, msg.data.lon);
                }
            }
        }
        else if (msg.type === "VIDEO") {
            const canvas = document.getElementById('video-canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = "data:image/jpeg;base64," + msg.data;
        }
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
        // ⭐ map_manager.js에 선언된 flightPath 객체 접근
        if (typeof flightPath !== "undefined") {
            flightPath.setPath([]); 
        }
    }
}

function sendCommand(command) {
    if (!isConnected || !ws) return addLog("명령 불가: 서버와 연결되지 않았습니다.");
    ws.send(command);
}

function drawStandbyFrame(text) {
    const canvas = document.getElementById('video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Consolas"';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}