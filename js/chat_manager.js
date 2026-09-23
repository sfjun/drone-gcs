// ==========================================
// chat_manager.js - 웹소켓 기반 통신으로 수정
// ==========================================

// 1. 고유 ID 생성 (내가 보낸 메시지와 남이 보낸 메시지 구분용)
const myClientId = Math.random().toString(36).substring(2, 10);

// 2. 서버의 채팅 웹소켓 주소로 연결
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const chatWs = new WebSocket(`${wsProtocol}//${window.location.host}/ws/chat`);

const commandChatInput = document.getElementById('chat-input');
const commandChatLog = document.getElementById('chat-log-area');

function getChatTime() {
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
}

function appendCommandChatMessage(text, type = 'received', sender = 'CONTROL', time = getChatTime()) {
    const message = document.createElement('div');
    message.classList.add('chat-message', type);

    if (type === 'system') {
        const textElement = document.createElement('div');
        textElement.className = 'chat-text';
        textElement.textContent = `[${time}] ${text}`;
        message.appendChild(textElement);
    } else {
        const meta = document.createElement('div');
        meta.className = 'chat-meta';
        meta.textContent = `[${time}] ${sender}`;

        const textElement = document.createElement('div');
        textElement.className = 'chat-text';
        textElement.textContent = String(text);

        message.appendChild(meta);
        message.appendChild(textElement);
    }

    if(commandChatLog) {
        commandChatLog.appendChild(message);
        commandChatLog.scrollTop = commandChatLog.scrollHeight;
    }
}

// 3. 메시지 전송 로직 수정 (웹소켓 사용)
function sendCommandChat() {
    if(!commandChatInput) return;
    const message = commandChatInput.value.trim();
    if (message === '') return;

    // 서버로 보낼 데이터 (내 ID와 메시지)
    const payload = {
        id: myClientId,
        text: message
    };
    
    // 서버가 연결되어 있을 때만 전송
    if (chatWs.readyState === WebSocket.OPEN) {
        chatWs.send(JSON.stringify(payload));
    }

    commandChatInput.value = '';
    commandChatInput.focus();
}

// 4. 서버로부터 메시지 수신 로직
chatWs.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    // 내 ID와 일치하면 내가 보낸 것(오른쪽), 아니면 남이 보낸 것(왼쪽)으로 처리
    if (data.id === myClientId) {
        appendCommandChatMessage(data.text, 'sent', 'ME');
    } else {
        appendCommandChatMessage(data.text, 'received', 'TEAM');
    }
};

function switchBottomTab(tabName, clickedButton) {
    const logView = document.getElementById('view-log');
    const chatView = document.getElementById('view-chat');
    const buttons = document.querySelectorAll('.sub-tab-btn');

    buttons.forEach(function(button) {
        button.classList.remove('active');
        button.style.background = '#0b141a';
        button.style.color = '#94a3b8';
        button.style.borderBottom = '1px solid #1e293b';
    });

    if (tabName === 'log' && logView && chatView) {
        logView.style.display = 'flex';
        chatView.style.display = 'none';
    } else if (tabName === 'chat' && logView && chatView) {
        logView.style.display = 'none';
        chatView.style.display = 'flex';
        setTimeout(function() {
            if(commandChatInput) commandChatInput.focus();
        }, 50);
    }

    if (clickedButton) {
        clickedButton.classList.add('active');
        clickedButton.style.background = '#0f172a';
        clickedButton.style.color = '#38bdf8';
        clickedButton.style.borderBottom = '2px solid #38bdf8';
    }
}

window.sendChat = sendCommandChat;
window.sendMessage = sendCommandChat;
window.switchTab = switchBottomTab;

// 연결 상태 알림
chatWs.onopen = () => appendCommandChatMessage('관제 서버에 연결되었습니다.', 'system', 'SYSTEM');
chatWs.onclose = () => appendCommandChatMessage('관제 서버와 연결이 끊어졌습니다.', 'system', 'SYSTEM');

