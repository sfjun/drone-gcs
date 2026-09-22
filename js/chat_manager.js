// ==========================================
// chat_manager.js - 관제 채팅 (BroadcastChannel) 분리 모듈
// ==========================================

const commandChatChannel = new BroadcastChannel('chat_channel');
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

function sendCommandChat() {
    if(!commandChatInput) return;
    const message = commandChatInput.value.trim();
    if (message === '') return;

    commandChatChannel.postMessage(message);
    appendCommandChatMessage(message, 'sent', 'ME');

    commandChatInput.value = '';
    commandChatInput.focus();
}

commandChatChannel.onmessage = function(event) {
    appendCommandChatMessage(event.data, 'received', 'CONTROL');
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

appendCommandChatMessage('관제 채팅 시스템 활성화', 'system', 'SYSTEM');

window.addEventListener('beforeunload', function() {
    commandChatChannel.close();
});