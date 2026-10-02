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
// (만약 목록에 없는 IP로 접속할 경우를 대비해 기본값을 기존 키로 설정)
const VWORLD_KEY = VWORLD_KEYS[currentHost] || "146276DC-08A0-4AEB-8B6B-191171FECE2A";

// ALLOWED_DOMAIN은 기존 코드 그대로 유지합니다.
const ALLOWED_DOMAIN = window.location.origin; // 서버 운영 도메인

var map;
var droneFeature;
var flightPathFeature;
var targetFeature = null;
var isFirstLocation = true; 
var dispatchOverlay = null;

// 벡터 소스들 (마커 및 경로용)
var markerSource = new ol.source.Vector();
var pathSource = new ol.source.Vector();

document.addEventListener("DOMContentLoaded", function() {
    
    var mapContainer = document.getElementById('map'); 
    if (!mapContainer) return;

    // 1. 브이월드 타일 레이어 설정 (일반, 위성, 공역)
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
        visible: false // 초기엔 숨김
    });

    var vworldHybrid = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`,
            crossOrigin: 'anonymous'
        }),
        visible: false // 초기엔 숨김 (위성 지도에 지명 얹기용)
    });

    var droneAirspaceLayer = new ol.layer.Tile({
        source: new ol.source.TileWMS({
            url: "https://api.vworld.kr/req/wms",
            params: {
                'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap',
                'KEY': VWORLD_KEY, 'DOMAIN': ALLOWED_DOMAIN,
                'LAYERS': 'lt_c_aisprhc,lt_c_aisresc', // 비행금지, 제한
                'CRS': 'EPSG:3857', 'FORMAT': 'image/png', 'TRANSPARENT': 'TRUE'
            }            
        }),
        opacity: 0.45
    });

    // 2. 벡터 레이어 설정 (드론 경로 및 마커)
    var pathLayer = new ol.layer.Vector({
        source: pathSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#38bdf8', width: 3 })
        })
    });

    var markerLayer = new ol.layer.Vector({ source: markerSource, zIndex: 100 });

    // 3. 지도 객체 생성
    map = new ol.Map({
        target: 'map',
        layers: [vworldBase, vworldSat, vworldHybrid, droneAirspaceLayer, pathLayer, markerLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([126.91946, 37.46067]), // 초기 중심 좌표
            zoom: 14, minZoom: 6, maxZoom: 19
        }),
        controls: ol.control.defaults.defaults({ zoom: true, attribution: false })
    });

    // 4. 마우스 커서 십자선 및 실시간 좌표 HUD 표시
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

    // 5. 드론 마커 초기화
    var droneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8" width="32" height="32"><path d="M21 10.999h-3.5c-.328-2.029-2.076-3.5-4.167-3.5-1.921 0-3.541 1.258-4.041 3H2.835C1.849 10.499 1 11.312 1 12.333c0 1.02.849 1.833 1.835 1.833H9.29c.498 1.741 2.119 3 4.041 3 2.09 0 3.839-1.471 4.167-3.5H21c1.103 0 2-.897 2-2s-.897-2-2-2zm-7.667 2.833c-1.196 0-2.167-.971-2.167-2.167s.971-2.167 2.167-2.167 2.167.971 2.167 2.167-.971 2.167-2.167 2.167z"/></svg>`;
    
    droneFeature = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([126.91941, 37.46083])) });
    droneFeature.setStyle(new ol.style.Style({
        image: new ol.style.Icon({ src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(droneSvg), anchor: [0.5, 0.5], scale: 1 })
    }));
    markerSource.addFeature(droneFeature);

    flightPathFeature = new ol.Feature({ geometry: new ol.geom.LineString([]) });
    pathSource.addFeature(flightPathFeature);

    // 6. 지도 클릭 시 타겟 마커 및 출동 팝업 
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
        var lonlat = ol.proj.transform(e.coordinate, 'EPSG:3857', 'EPSG:4326');
        var lon = lonlat[0];
        var lat = lonlat[1];

        // 뷰 이동
        map.getView().animate({ center: e.coordinate, zoom: 20, duration: 500 });

        // 마커 업데이트
        // ✨ 변경된 코드: 빨간색 핀 마커 생성 ✨
        var pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#ef4444" stroke="#ffffff" stroke-width="1"/></svg>`;
        var pinStyle = new ol.style.Style({
            image: new ol.style.Icon({
                src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSvg),
                anchor: [0.5, 1], // 뾰족한 끝부분이 정확한 좌표를 가리키도록 설정
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
        
        // ✨ 날씨 즉시 업데이트 연동 ✨
        if (typeof window.fetchWeatherData === 'function') window.fetchWeatherData(lat, lon);

        // VWorld Geocoder 호출 (JSONP)
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

            popupElement.innerHTML = `
                <div style="background: #1e293b; color: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #334155; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); text-align: center; min-width: 210px;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; color: #38bdf8;">출동 하시겠습니까?</p>
                    <div style="font-size: 13px; margin-bottom: 4px; font-weight: bold;">${addressText}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">(${lat.toFixed(5)}, ${lon.toFixed(5)})</div>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button id="btn-popup-arm" style="padding: 6px 14px; background-color: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">출동</button>
                        <button style="padding: 6px 14px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;" onclick="closeDispatchPopup()">취소</button>
                    </div>
                </div>
            `;
            
            dispatchOverlay.setPosition(e.coordinate);

            setTimeout(function() {
                const btnArm = document.getElementById('btn-popup-arm');
                if (btnArm) {
                    btnArm.onclick = function() {
                        if (typeof sendCommand === "function") {
                            sendCommand("ARM");
                            addLog("🚀 출동 승인: 기체 시동(ARM)을 요청합니다.");
                        }
                        closeDispatchPopup();
                    };
                }
            }, 50);

            document.body.removeChild(script);
            delete window[callbackName];
        };
        document.body.appendChild(script);
    });

    // 7. 일반/위성 버튼 설정 (오픈레이어스 레이어 토글)
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

// 8. 드론 위치 실시간 이동 함수 
window.moveMarker = function(lat, lon) {
    if(!map || !droneFeature || !flightPathFeature) return; 
    
    var coord = ol.proj.fromLonLat([lon, lat]);
    droneFeature.setGeometry(new ol.geom.Point(coord));
    
    if (isFirstLocation) {
        map.getView().setCenter(coord);
        isFirstLocation = false;
    }
    
    var pathGeom = flightPathFeature.getGeometry();
    pathGeom.appendCoordinate(coord);
};

// 9. 장소/주소 검색 기능 (자동완성 및 엔터키 이동 지원)
window.searchAddress = function(autoMove = false) {
    if(!map) return;

    // ✨ 1. 엔터를 치면 예약되어 있던 자동완성(0.3초 뒤 열림)을 즉시 취소!
    if (window.searchTimeout) {
        clearTimeout(window.searchTimeout);
    }

    var query = document.getElementById('address-input').value;
    
    // 빈칸일 때 드롭다운 닫고 종료
    if (!query.trim()) { 
        document.getElementById('search-results-dropdown').style.display = 'none';
        return; 
    }

    // const isAddress = /\d/.test(query);
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
        dropdown.innerHTML = ''; // 기존 목록 초기화

        if (data.response && data.response.status === "OK" && data.response.result.items.length > 0) {  
            dropdown.style.display = 'flex'; // 드롭다운 열기

            let items = data.response.result.items;
        
            items.sort((a, b) => {
                const nameA = a.title || (a.address ? (a.address.road || a.address.parcel) : "") || "";
                const nameB = b.title || (b.address ? (b.address.road || b.address.parcel) : "") || "";

                // 1. 검색어와 완전히 똑같은 항목을 무조건 1등으로
                if (nameA === query) return -1;
                if (nameB === query) return 1;

                // 2. 검색어로 시작하는 항목을 그 다음으로 (예: "일동" 검색 시 "일동로"가 "상록구 일동"보다 위로)
                const aStarts = nameA.includes(query) && nameA.indexOf(query) === 0;
                const bStarts = nameB.includes(query) && nameB.indexOf(query) === 0;
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                // 3. 둘 다 포함되어 있다면 전체 글자 수가 짧은 것을 위로 (불필요한 긴 주소 쳐내기)
                // return nameA.length - nameB.length;
            });

            data.response.result.items.forEach((item, index) => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid #334155; cursor: pointer; color: #e2e8f0; font-size: 13px; font-weight: normal; transition: 0.2s; text-align: left;';
                
                div.onmouseover = () => div.style.background = '#334155';
                div.onmouseout = () => div.style.background = 'transparent';
                
                const itemName = item.title || (item.address ? (item.address.road || item.address.parcel) : "") || "이름 없는 장소";
    
                div.innerHTML = `<span style="color:#38bdf8; font-weight:bold; margin-right:5px;">[${index+1}]</span> ${itemName}`;

                div.onclick = () => {
                    dropdown.style.display = 'none'; // 클릭 후 창 닫기
                    document.getElementById('address-input').value = itemName; // 검색창에 이름 고정
                    
                    // ✨ 2. 검색창에 남아있는 커서 깜빡임(포커스) 제거
                    document.getElementById('address-input').blur(); 

                    const coord = [parseFloat(item.point.x), parseFloat(item.point.y)];
                    const lonlat = ol.proj.transform(coord, 'EPSG:3857', 'EPSG:4326');
                    const lon = lonlat[0];
                    const lat = lonlat[1];

                    map.getView().animate({ center: coord, zoom: 16, duration: 800 });

                    // 빨간색 핀 그리기
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

            // ✨ 3. 엔터키(autoMove = true)로 검색했을 경우, 강제로 첫 번째 결과 클릭
            if (autoMove && dropdown.children.length > 0) {
                dropdown.children[0].onclick();
            }

        } else {
            // 결과가 없을 때 처리
            dropdown.style.display = 'flex';
            const div = document.createElement('div');
            div.style.cssText = 'padding: 10px 12px; color: #94a3b8; font-size: 13px; text-align: center;';
            div.innerText = '검색 결과가 없습니다.';
            dropdown.appendChild(div);
            setTimeout(() => dropdown.style.display = 'none', 2000); // 2초 뒤 창 닫기
        }
        
        document.body.removeChild(script);
        delete window[callbackName];
    };
    
    document.body.appendChild(script);
};

// 화면 빈 곳을 클릭하면 드롭다운 닫기
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('search-results-dropdown');
    const searchInput = document.getElementById('address-input');
    if (dropdown && dropdown.style.display === 'flex') {
        if(e.target !== searchInput && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});