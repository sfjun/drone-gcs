// js/gcs_client.js

var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
var satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20 });

// 👇 1. 지도가 처음 켜질 때 바라보는 중심 좌표를 변경했습니다.
var map = L.map('map', {
    center: [37.46067, 126.91946], 
    zoom: 16,
    layers: [osmLayer]
});

document.getElementById('btn-map-osm').addEventListener('click', function() {
    if (!map.hasLayer(osmLayer)) {
        map.removeLayer(satelliteLayer);
        map.addLayer(osmLayer);
        this.className = 'btn-blue';
        document.getElementById('btn-map-sat').className = 'btn-gray';
    }
});

document.getElementById('btn-map-sat').addEventListener('click', function() {
    if (!map.hasLayer(satelliteLayer)) {
        map.removeLayer(osmLayer);
        map.addLayer(satelliteLayer);
        this.className = 'btn-blue';
        document.getElementById('btn-map-osm').className = 'btn-gray';
    }
});

var mapContainer = document.getElementById('map');
var crossX = document.createElement('div');
crossX.className = 'crosshair-x';
var crossY = document.createElement('div');
crossY.className = 'crosshair-y';

mapContainer.appendChild(crossX);
mapContainer.appendChild(crossY);

var liveCoordsText = document.getElementById('live-coordinates');

map.on('mousemove', function(e) {
    crossX.style.display = 'block';
    crossY.style.display = 'block';
    crossX.style.top = e.containerPoint.y + 'px';
    crossY.style.left = e.containerPoint.x + 'px';

    liveCoordsText.innerText = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
});

map.on('mouseout', function(e) {
    crossX.style.display = 'none';
    crossY.style.display = 'none';
    liveCoordsText.innerText = '---.-----, ---.-----';
});

var droneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8" width="32" height="32"><path d="M21 10.999h-3.5c-.328-2.029-2.076-3.5-4.167-3.5-1.921 0-3.541 1.258-4.041 3H2.835C1.849 10.499 1 11.312 1 12.333c0 1.02.849 1.833 1.835 1.833H9.29c.498 1.741 2.119 3 4.041 3 2.09 0 3.839-1.471 4.167-3.5H21c1.103 0 2-.897 2-2s-.897-2-2-2zm-7.667 2.833c-1.196 0-2.167-.971-2.167-2.167s.971-2.167 2.167-2.167 2.167.971 2.167 2.167-.971 2.167-2.167 2.167z"/></svg>`;
var droneIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(droneSvg);

var droneIcon = L.icon({
    iconUrl: droneIconUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

// 👇 2. 처음 띄워두는 드론 마커의 위치도 동일하게 변경했습니다.
var marker = L.marker([37.46083, 126.91941], {icon: droneIcon}).addTo(map);
var flightPath = L.polyline([], {color: '#38bdf8', weight: 3}).addTo(map);

var targetMarker = null; 
window.targetWaypoint = null; 

map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (targetMarker) {
        targetMarker.setLatLng(e.latlng);
    } else {
        targetMarker = L.marker(e.latlng).addTo(map);
    }

    window.targetWaypoint = { lat: lat, lon: lon };
    
    document.getElementById('target-coords').value = lat.toFixed(5) + ", " + lon.toFixed(5);
    
    addLog(`📍 목표 지점 설정됨: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
});

function moveMarker(lat, lon) {
    var newLatLng = new L.LatLng(lat, lon);
    marker.setLatLng(newLatLng);
    map.panTo(newLatLng);
    flightPath.addLatLng(newLatLng);
}

function addLog(msg) {
    const logDiv = document.getElementById("log-area");
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    logDiv.innerHTML += `[${timeStr}] ${msg}<br>`;
    logDiv.scrollTop = logDiv.scrollHeight;
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
        else if (msg.type === "GPS") {
            document.getElementById("alt").innerText = msg.data.alt.toFixed(1);
            document.getElementById("gps").innerText = `${msg.data.lat.toFixed(5)},\n${msg.data.lon.toFixed(5)}`;
            
            if (msg.data.lat !== 0 && msg.data.lon !== 0) {
                moveMarker(msg.data.lat, msg.data.lon);
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
        flightPath.setLatLngs([]);
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

window.onload = () => drawStandbyFrame("WAITING FOR SIGNAL...");

// ====== 주소 검색 및 지도 이동 기능 ======
function searchAddress() {
    const query = document.getElementById('address-input').value;
    if (!query) {
        alert("검색할 주소를 입력해주세요.");
        return;
    }

    // OSM Nominatim API를 이용한 무료 지오코딩
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                // 가장 정확도 높은 첫 번째 검색 결과의 좌표 가져오기
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                // 1. 지도 이동 및 줌 레벨 설정 (17 정도로 확대)
                map.setView([lat, lon], 17);

                // 2. 검색 위치에 타겟 마커 생성 및 이동
                if (targetMarker) {
                    targetMarker.setLatLng([lat, lon]);
                } else {
                    targetMarker = L.marker([lat, lon]).addTo(map);
                }

                // 3. 글로벌 TGT 좌표 업데이트
                window.targetWaypoint = { lat: lat, lon: lon };
                
                // 4. UI 텍스트 업데이트
                document.getElementById('target-coords').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                addLog(`📍 주소 검색으로 목표 지점 설정됨: ${query}`);
                
            } else {
                alert("검색 결과가 없습니다. 도로명 주소나 좀 더 큰 단위의 지명으로 검색해보세요.");
            }
        })
        .catch(error => {
            console.error("주소 검색 중 오류 발생:", error);
            alert("주소 검색 서버에 연결할 수 없습니다.");
        });
}