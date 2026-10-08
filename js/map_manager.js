// ==========================================
// map_manager.js - 브이월드(OpenLayers) 전용 모듈
// ==========================================

// 1. IP(또는 도메인)별로 발급받은 키를 짝지어 정리합니다.
const VWORLD_KEYS = {
    //김태정
    "172.30.1.60": "146276DC-08A0-4AEB-8B6B-191171FECE2A", 
    "192.168.0.7": "10A1AE7F-6846-4723-926A-0C5AC671EE54",
};

// 2. 현재 접속한 호스트(IP)를 확인합니다.
const currentHost = window.location.hostname;

// 3. 접속한 IP에 맞는 키를 찾아 할당합니다. 
const VWORLD_KEY = VWORLD_KEYS[currentHost] || "146276DC-08A0-4AEB-8B6B-191171FECE2A";
const ALLOWED_DOMAIN = window.location.origin; 

var map;
var droneFeature;
var flightPathFeature;
var targetFeature = null;
var isFirstLocation = true; 
var dispatchOverlay = null;

var markerSource = new ol.source.Vector();
var pathSource = new ol.source.Vector();

document.addEventListener("DOMContentLoaded", function() {
    
    var mapContainer = document.getElementById('map'); 
    if (!mapContainer) return;

    var vworldBase = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
            crossOrigin: 'anonymous' 
        })
    });

    var vworldSat = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
            crossOrigin: 'anonymous'
        }),
        visible: false 
    });

    var vworldHybrid = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`,
            crossOrigin: 'anonymous'
        }),
        visible: false 
    });

    var droneAirspaceLayer = new ol.layer.Tile({
        source: new ol.source.TileWMS({
            url: "https://api.vworld.kr/req/wms",
            params: {
                'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap',
                'KEY': VWORLD_KEY, 'DOMAIN': ALLOWED_DOMAIN,
                'LAYERS': 'lt_c_aisprhc,lt_c_aisresc',
                'CRS': 'EPSG:3857', 'FORMAT': 'image/png', 'TRANSPARENT': 'TRUE'
            }            
        }),
        opacity: 0.45
    });

    var pathLayer = new ol.layer.Vector({
        source: pathSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#38bdf8', width: 3 })
        })
    });

    var markerLayer = new ol.layer.Vector({ source: markerSource, zIndex: 100 });

    // 🎯 3. 지도 객체 생성 (원래 디폴트 좌표 복구 + 최대 줌 19 적용)
    map = new ol.Map({
        target: 'map',
        layers: [vworldBase, vworldSat, vworldHybrid, droneAirspaceLayer, pathLayer, markerLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([126.91946, 37.46067]), // 원래 디폴트 좌표
            zoom: 19, // 줌 레벨은 19(최대)로 유지
            minZoom: 6, maxZoom: 19
        }),
        controls: ol.control.defaults.defaults({ zoom: true, attribution: false })
    });

    var crossX = document.createElement('div'); crossX.className = 'crosshair-x';
    var crossY = document.createElement('div'); crossY.className = 'crosshair-y';
    mapContainer.appendChild(crossX);
    mapContainer.appendChild(crossY);

    var liveCoordsText = document.getElementById('live-coordinates');

    map.on('pointermove', function(e) {
        if (liveCoordsText) {
            var lonlat = ol.proj.transform(e.coordinate, 'EPSG:3857', 'EPSG:4326');
            liveCoordsText.innerText = lonlat[1].toFixed(5) + ', ' + lonlat[0].toFixed(5);
        }
    });

    mapContainer.addEventListener('mouseleave', function() {
        if (liveCoordsText) liveCoordsText.innerText = '---.-----, ---.-----';
        crossX.style.display = 'none'; crossY.style.display = 'none';
    });

    mapContainer.addEventListener('mousemove', function(e) {
        crossX.style.display = 'block'; crossY.style.display = 'block';
        var rect = mapContainer.getBoundingClientRect();
        crossY.style.left = (e.clientX - rect.left) + 'px';
        crossX.style.top = (e.clientY - rect.top) + 'px';
    });

    var droneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="48" height="48" style="filter: drop-shadow(0px 4px 5px rgba(0,0,0,0.5));">
        <g stroke="#38bdf8" stroke-width="6" fill="none">
            <circle cx="22" cy="22" r="16"/>
            <circle cx="78" cy="22" r="16"/>
            <circle cx="22" cy="78" r="16"/>
            <circle cx="78" cy="78" r="16"/>
        </g>
        <g stroke="#38bdf8" stroke-width="8" stroke-linecap="round">
            <line x1="22" y1="22" x2="50" y2="50"/>
            <line x1="78" y1="22" x2="50" y2="50"/>
            <line x1="22" y1="78" x2="50" y2="50"/>
            <line x1="78" y1="78" x2="50" y2="50"/>
        </g>
        <rect x="36" y="32" width="28" height="36" rx="8" fill="#38bdf8"/>
        <rect x="46" y="26" width="8" height="8" rx="2" fill="#0f172a"/>
        <circle cx="50" cy="30" r="2" fill="#ef4444"/>
        <g fill="#0f172a">
            <circle cx="22" cy="22" r="4"/>
            <circle cx="78" cy="22" r="4"/>
            <circle cx="22" cy="78" r="4"/>
            <circle cx="78" cy="78" r="4"/>
        </g>
    </svg>`;
    
    // 🎯 원래 디폴트 마커 좌표 복구
    droneFeature = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([126.91941, 37.46083])) });
    droneFeature.setStyle(new ol.style.Style({
        image: new ol.style.Icon({ 
            src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(droneSvg), 
            anchor: [0.5, 0.5], 
            scale: 1.0 
        })
    }));
    markerSource.addFeature(droneFeature);

    flightPathFeature = new ol.Feature({ geometry: new ol.geom.LineString([]) });
    pathSource.addFeature(flightPathFeature);

    window.plannedPathFeature = new ol.Feature({ geometry: new ol.geom.LineString([]) });
    window.plannedPathFeature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({ 
            color: '#facc15', 
            width: 4,             
            lineDash: [8, 8] 
        }),
        zIndex: 999               
    }));
    pathSource.addFeature(window.plannedPathFeature);

    var popupElement = document.createElement('div');
    popupElement.className = 'dispatch-popup';
    dispatchOverlay = new ol.Overlay({
        element: popupElement,
        positioning: 'bottom-center',
        offset: [0, -45],
        stopEvent: true
    });
    map.addOverlay(dispatchOverlay);

    window.closeDispatchPopup = function() {
        dispatchOverlay.setPosition(undefined);
    };

    map.on('singleclick', function(e) {
        //웨이포인트 편집 중일 때는 클릭 이벤트(팝업 생성) 무시
        if (window.isWaypointEditing) return;

        if (window.plannedPathFeature) window.plannedPathFeature.getGeometry().setCoordinates([]);
        var lonlat = ol.proj.transform(e.coordinate, 'EPSG:3857', 'EPSG:4326');
        var lon = lonlat[0];
        var lat = lonlat[1];

        map.getView().animate({ center: e.coordinate, zoom: 20, duration: 500 });

        var pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#ef4444" stroke="#ffffff" stroke-width="1"/></svg>`;
        var pinStyle = new ol.style.Style({
            image: new ol.style.Icon({
                src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSvg),
                anchor: [0.5, 1], 
                scale: 1.1
            })
        });

        if (targetFeature) {
            targetFeature.setGeometry(new ol.geom.Point(e.coordinate));
        } else {
            targetFeature = new ol.Feature({ geometry: new ol.geom.Point(e.coordinate) });
            targetFeature.setStyle(pinStyle);
            markerSource.addFeature(targetFeature);
        }

        window.targetWaypoint = { lat: lat, lon: lon };
        
        var tgtCoords = document.getElementById('target-coords');
        if(tgtCoords) tgtCoords.value = lat.toFixed(5) + ", " + lon.toFixed(5);
        
        if (typeof addLog === "function") addLog(`📍 목표 지점 클릭 설정됨: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        
        if (typeof window.fetchWeatherData === 'function') window.fetchWeatherData(lat, lon);

        const callbackName = 'vworldClick_' + Math.round(100000 * Math.random());
        const searchUrl = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lon},${lat}&format=json&type=BOTH&zipcode=true&simple=false&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&callback=${callbackName}`;
        
        const script = document.createElement('script');
        script.src = searchUrl;

        window[callbackName] = function(data) {
            var addressText = "주소 또는 장소 정보 없음 (산악/해상 등)";
            if (data.response.status === "OK") {
                addressText = data.response.result[0].text;
            }

            var searchInput = document.getElementById('address-input');
            if (searchInput) {
                searchInput.value = addressText !== "주소 또는 장소 정보 없음 (산악/해상 등)" ? addressText : "";
            }

            // [수정된 부분] 팝업창에 직선 출동, 내비 출동, 웨이포인트 버튼 3개 생성
            popupElement.innerHTML = `
                <div style="background: #1e293b; color: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #334155; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); text-align: center; min-width: 260px;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; color: #38bdf8;">출동 방식을 선택하세요</p>
                    <div style="font-size: 13px; margin-bottom: 4px; font-weight: bold;">${addressText}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">목표: (${lat.toFixed(5)}, ${lon.toFixed(5)})</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <button id="btn-direct-dispatch" style="padding: 8px; background-color: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;">
                            🚀 직선 출동 (최단거리)
                        </button>
                        <button id="btn-navi-dispatch" style="padding: 8px; background-color: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;">
                            🚓 도로망 내비게이션 출동
                        </button>
                        <button id="btn-waypoint-setup" style="padding: 8px; background-color: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;">
                            🗺️ 웨이포인트 직접 설정
                        </button>
                        <button onclick="closeDispatchPopup()" style="padding: 6px; background-color: #475569; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; transition: 0.2s;">
                            취소
                        </button>
                    </div>
                </div>
            `;
            
            dispatchOverlay.setPosition(e.coordinate);

            setTimeout(function() {
                // 1. 직선 출동 로직 (기존 출동 버튼과 동일)
                const btnDirect = document.getElementById('btn-direct-dispatch');
                if (btnDirect) {
                    btnDirect.onclick = function() {
                        if (typeof window.dispatchDrone === "function") {
                            window.dispatchDrone();
                        } else {
                            if (typeof connectWebSocket === "function") connectWebSocket();
                            setTimeout(() => {
                                if (typeof sendCommand === "function") {
                                    sendCommand('ARM');
                                    if (typeof addLog === "function") addLog("🚀 출동 승인: 기체 시동(ARM)을 요청합니다.");
                                }
                            }, 1500);
                            setTimeout(() => {
                                if (typeof sendCommand === "function") sendCommand('TAKEOFF');
                            }, 2500);
                        }
                        closeDispatchPopup(); 
                    };
                }
                
                // 2. [신규] 카카오 내비게이션 출동 로직
                const btnNavi = document.getElementById('btn-navi-dispatch');
                if (btnNavi) {
                    btnNavi.onclick = function() {
                        closeDispatchPopup();
                        if (typeof updateEventLog === "function") updateEventLog("🚗 도로망 길찾기 경로를 탐색합니다...");
                        
                        // 드론 현재 좌표 획득
                        var droneCoord = droneFeature.getGeometry().getCoordinates();
                        var startLonLat = ol.proj.transform(droneCoord, 'EPSG:3857', 'EPSG:4326');
                        
                        if (typeof window.executeNaviDispatch === "function") {
                            window.executeNaviDispatch(startLonLat[1], startLonLat[0], lat, lon);
                        }
                    };
                }

                // 3. 웨이포인트 설정 로직 (다음 단계 준비용)
                const btnWaypoint = document.getElementById('btn-waypoint-setup');
                if (btnWaypoint) {
                    btnWaypoint.onclick = function() {
                        closeDispatchPopup();
                        if (typeof addLog === "function") addLog("🗺️ 웨이포인트 편집 모드가 활성화되었습니다. 점선을 드래그하세요.");
                        
                        // 2단계: 웨이포인트 편집(Modify) 모드 활성화 함수 호출
                        if (typeof window.enableWaypointEditMode === "function") {
                            window.enableWaypointEditMode(lat, lon);
                        } else {
                            console.warn("enableWaypointEditMode 함수가 아직 정의되지 않았습니다.");
                        }
                    };
                }
            }, 50);

            document.body.removeChild(script);
            delete window[callbackName];
        };
        document.body.appendChild(script);
    });

    var btnOsm = document.getElementById('btn-map-osm');
    var btnSat = document.getElementById('btn-map-sat');

    if (btnOsm && btnSat) {
        btnOsm.addEventListener('click', function() {
            vworldBase.setVisible(true);
            vworldSat.setVisible(false);
            vworldHybrid.setVisible(false);
            btnOsm.className = 'btn-blue'; btnSat.className = 'btn-gray';
        });

        btnSat.addEventListener('click', function() {
            vworldBase.setVisible(false);
            vworldSat.setVisible(true);
            vworldHybrid.setVisible(true);
            btnOsm.className = 'btn-gray'; btnSat.className = 'btn-blue';
        });
    }
});

window.moveMarker = function(lat, lon, hdg) {
    if(!map || !droneFeature || !flightPathFeature) return; 
    
    var coord = ol.proj.fromLonLat([lon, lat]);
    droneFeature.setGeometry(new ol.geom.Point(coord));
    
    if (hdg !== undefined && hdg !== null) {
        var rad = hdg * (Math.PI / 180);
        droneFeature.getStyle().getImage().setRotation(rad);
    }

    if (isFirstLocation) {
        map.getView().setCenter(coord);
        isFirstLocation = false;
    }
    
    var pathGeom = flightPathFeature.getGeometry();
    pathGeom.appendCoordinate(coord);
};

window.searchAddress = function(autoMove = false) {
    if(!map) return;

    if (window.searchTimeout) {
        clearTimeout(window.searchTimeout);
    }

    var query = document.getElementById('address-input').value;
    
    if (!query.trim()) { 
        document.getElementById('search-results-dropdown').style.display = 'none';
        return; 
    }

    const isAddress = /\d/.test(query) || /(로|길|동|읍|면|리)$/.test(query.trim());
    const searchType = isAddress ? "ADDRESS" : "PLACE";
    const categoryParam = isAddress ? "&category=ROAD" : "";
    
    const callbackName = 'vworldSearch_' + Math.round(100000 * Math.random());
    const searchUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:3857&size=5&page=1&type=${searchType}${categoryParam}&query=${encodeURIComponent(query)}&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&callback=${callbackName}`;

    const script = document.createElement('script');
    script.src = searchUrl;

    window[callbackName] = function(data) {
        const dropdown = document.getElementById('search-results-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = ''; 

        if (data.response && data.response.status === "OK" && data.response.result.items.length > 0) {  
            dropdown.style.display = 'flex'; 

            let items = data.response.result.items;
        
            items.sort((a, b) => {
                const nameA = a.title || (a.address ? (a.address.road || a.address.parcel) : "") || "";
                const nameB = b.title || (b.address ? (b.address.road || b.address.parcel) : "") || "";

                if (nameA === query) return -1;
                if (nameB === query) return 1;

                const aStarts = nameA.includes(query) && nameA.indexOf(query) === 0;
                const bStarts = nameB.includes(query) && nameB.indexOf(query) === 0;
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
            });

            data.response.result.items.forEach((item, index) => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid #334155; cursor: pointer; color: #e2e8f0; font-size: 13px; font-weight: normal; transition: 0.2s; text-align: left;';
                
                div.onmouseover = () => div.style.background = '#334155';
                div.onmouseout = () => div.style.background = 'transparent';
                
                const itemName = item.title || (item.address ? (item.address.road || item.address.parcel) : "") || "이름 없는 장소";
    
                div.innerHTML = `<span style="color:#38bdf8; font-weight:bold; margin-right:5px;">[${index+1}]</span> ${itemName}`;

                div.onclick = () => {
                    dropdown.style.display = 'none'; 
                    document.getElementById('address-input').value = itemName; 
                    
                    document.getElementById('address-input').blur(); 

                    const coord = [parseFloat(item.point.x), parseFloat(item.point.y)];
                    const lonlat = ol.proj.transform(coord, 'EPSG:3857', 'EPSG:4326');
                    const lon = lonlat[0];
                    const lat = lonlat[1];

                    map.getView().animate({ center: coord, zoom: 16, duration: 800 });

                    var pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#ef4444" stroke="#ffffff" stroke-width="1"/></svg>`;
                    var pinStyle = new ol.style.Style({
                        image: new ol.style.Icon({ src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSvg), anchor: [0.5, 1], scale: 1.1 })
                    });

                    if (targetFeature) {
                        targetFeature.setGeometry(new ol.geom.Point(coord));
                    } else {
                        targetFeature = new ol.Feature({ geometry: new ol.geom.Point(coord) });
                        targetFeature.setStyle(pinStyle);
                        markerSource.addFeature(targetFeature);
                    }

                    window.targetWaypoint = { lat: lat, lon: lon };
                    var tgtCoords = document.getElementById('target-coords');
                    if(tgtCoords) tgtCoords.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                    
                    if (typeof addLog === "function") addLog(`📍 장소 선택됨: ${itemName}`);
                    if (typeof window.fetchWeatherData === 'function') window.fetchWeatherData(lat, lon);
                };
                dropdown.appendChild(div);
            });

            if (autoMove && dropdown.children.length > 0) {
                dropdown.children[0].onclick();
            }

        } else {
            dropdown.style.display = 'flex';
            const div = document.createElement('div');
            div.style.cssText = 'padding: 10px 12px; color: #94a3b8; font-size: 13px; text-align: center;';
            div.innerText = '검색 결과가 없습니다.';
            dropdown.appendChild(div);
            setTimeout(() => dropdown.style.display = 'none', 2000); 
        }
        
        document.body.removeChild(script);
        delete window[callbackName];
    };
    
    document.body.appendChild(script);
};

window.drawPlannedPath = function(startCoord, endCoord) {
    if (window.plannedPathFeature) {
        window.plannedPathFeature.getGeometry().setCoordinates([startCoord, endCoord]);
    }
};

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('search-results-dropdown');
    const searchInput = document.getElementById('address-input');
    if (dropdown && dropdown.style.display === 'flex') {
        if(e.target !== searchInput && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

// ==========================================
// [신규 추가] 웨이포인트 편집 및 다중 경로 출동 로직
// ==========================================
window.isWaypointEditing = false;
window.waypointModify = null;

// 1. 웨이포인트 편집 모드 활성화
window.enableWaypointEditMode = function(lat, lon) {
    window.isWaypointEditing = true;

    // 드론 현재 위치와 목표 위치 좌표 가져오기
    var droneCoord = droneFeature.getGeometry().getCoordinates();
    var targetCoord = ol.proj.fromLonLat([lon, lat]);

    // 두 점을 잇는 점선(plannedPathFeature)을 먼저 그림
    if (window.plannedPathFeature) {
        window.plannedPathFeature.getGeometry().setCoordinates([droneCoord, targetCoord]);
    }

    // OpenLayers의 Modify 기능 활성화 (선 위의 점을 드래그하여 웨이포인트 추가)
    if (!window.waypointModify) {
        window.waypointModify = new ol.interaction.Modify({
            features: new ol.Collection([window.plannedPathFeature]),
            insertVertexCondition: ol.events.condition.always // 선을 클릭하면 항상 점(Vertex) 생성
        });
    }
    map.addInteraction(window.waypointModify);

    // 화면 하단 중앙에 [✅ 웨이포인트 설정 완료 및 출동] 플로팅 버튼 생성
    let btnContainer = document.getElementById('waypoint-btn-container');
    if (!btnContainer) {
        btnContainer = document.createElement('div');
        btnContainer.id = 'waypoint-btn-container';
        btnContainer.style.cssText = 'position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 9999;';
        const btnDone = document.createElement('button');
        btnDone.innerHTML = '✅ 웨이포인트 설정 완료 및 출동';
        btnDone.style.cssText = 'padding: 12px 24px; background-color: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; box-shadow: 0 6px 12px rgba(0,0,0,0.5); transition: 0.2s;';
        btnDone.onmouseover = () => btnDone.style.backgroundColor = '#2563eb';
        btnDone.onmouseout = () => btnDone.style.backgroundColor = '#3b82f6';
        btnDone.onclick = window.finishWaypointSetup;
        
        btnContainer.appendChild(btnDone);
        document.getElementById('map').appendChild(btnContainer); // 지도 위에 오버레이
    }
    btnContainer.style.display = 'block';
};

// 2. 웨이포인트 설정 완료 및 백엔드로 전송 준비
window.finishWaypointSetup = function() {
    window.isWaypointEditing = false;

    // 편집 모드(Modify 인터랙션) 끄기
    if (window.waypointModify) {
        map.removeInteraction(window.waypointModify);
    }

    // 완료 버튼 숨기기
    const btnContainer = document.getElementById('waypoint-btn-container');
    if (btnContainer) btnContainer.style.display = 'none';

    // 꺾인 점선(plannedPathFeature)의 모든 좌표(웨이포인트) 추출
    const coords = window.plannedPathFeature.getGeometry().getCoordinates();
    let missionCoords = [];
    
    // EPSG:3857(화면 좌표) -> EPSG:4326(위경도 좌표)로 변환하며 배열에 담기
    coords.forEach(function(coord) {
        let lonlat = ol.proj.transform(coord, 'EPSG:3857', 'EPSG:4326');
        missionCoords.push(`${lonlat[1].toFixed(6)},${lonlat[0].toFixed(6)}`); // lat,lon 형식
    });

    // 백엔드로 보낼 포맷 (예: MISSION:lat1,lon1|lat2,lon2|lat3,lon3)
    const missionString = "MISSION:" + missionCoords.join('|');
    
    // (임시) 로그창에 어떻게 전송될지 찍어보기
    if (typeof addLog === "function") {
        addLog(`✅ 다중 웨이포인트(${missionCoords.length}개) 경로가 생성되었습니다.`);
    }

    // 이 데이터를 파이썬 서버로 쏘고, 서버가 드론에 주입하는 로직
    if (typeof sendCommand === "function") {
        sendCommand(missionString);
    }
};

// ==========================================
// [원상 복구] 카카오 내비 API + 실패 시 직선 출동 방어 로직
// ==========================================
window.executeNaviDispatch = async function(startLat, startLon, targetLat, targetLon) {
    // 발급받으셨던 카카오 REST API 키
    const KAKAO_REST_KEY = "210a614a5fb6ebcfa3c618600c3a39ab"; 
    
    // 카카오 길찾기 단건 호출 API
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${startLon},${startLat}&destination=${targetLon},${targetLat}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        // ✨ 방어 로직: 카카오가 경로를 안 주면 '직선 출동'으로 자동 대체
        if (!data.routes || data.routes[0].result_code !== 0) {
            if (typeof updateEventLog === "function") {
                updateEventLog("⚠️ 카카오 도로망을 찾을 수 없어 [최단거리 직선 출동]으로 자동 대체합니다.");
            }
            if (typeof sendCommand === "function") {
                sendCommand(`MISSION:${startLat},${startLon}|${targetLat},${targetLon}`);
            }
            return;
        }

        let missionCoords = []; 
        let mapCoords = [];     

        const sections = data.routes[0].sections;
        sections.forEach(section => {
            section.roads.forEach(road => {
                const vertexes = road.vertexes;
                for (let i = 0; i < vertexes.length; i += 2) {
                    const lon = vertexes[i];
                    const lat = vertexes[i + 1];
                    
                    const coord3857 = ol.proj.transform([lon, lat], 'EPSG:4326', 'EPSG:3857');
                    mapCoords.push(coord3857);
                    
                    missionCoords.push(`${lat.toFixed(6)},${lon.toFixed(6)}`);
                }
            });
        });

        // 1. 화면의 VWorld 지도에 카카오 내비 경로(노란 점선) 렌더링
        if (window.plannedPathFeature) {
            window.plannedPathFeature.getGeometry().setCoordinates(mapCoords);
        }

        // 2. 파이썬 서버로 미션 데이터 전송
        const missionString = "MISSION:" + missionCoords.join('|');
        if (typeof sendCommand === "function") {
            sendCommand(missionString);
        }
        
        if (typeof updateEventLog === "function") {
            updateEventLog(`🚓 카카오 도로망 경로 탐색 완료! 최단 도로를 따라 출동합니다.`);
        }
        
    } catch (error) {
        console.error("Kakao Navi API Error:", error);
        // 에러 발생 시 직선 출동으로 강제 대체
        if (typeof updateEventLog === "function") {
            updateEventLog("❌ 카카오 통신 오류! [직선 출동]으로 강제 대체합니다.");
        }
        if (typeof sendCommand === "function") {
            sendCommand(`MISSION:${startLat},${startLon}|${targetLat},${targetLon}`);
        }
    }
};