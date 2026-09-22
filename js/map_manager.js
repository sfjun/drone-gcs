// ==========================================
// map_manager.js - 카카오맵 지도 전용 모듈
// ==========================================

var map;
var droneMarker;
var flightPath;
var geocoder;
var targetMarker = null;
var isFirstLocation = true; // 최초 1회 화면 포커싱을 위한 변수 추가

document.addEventListener("DOMContentLoaded", function() {
    
    // 1. 카카오맵 초기화 및 설정
    var mapContainer = document.getElementById('map'); 
    if (!mapContainer) return;

    var mapOption = { 
        center: new kakao.maps.LatLng(37.46067, 126.91946), 
        level: 3 
    };

    map = new kakao.maps.Map(mapContainer, mapOption);
    geocoder = new kakao.maps.services.Geocoder();

    var zoomControl = new kakao.maps.ZoomControl();
    map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

    // 2. 마우스 커서 십자선 및 실시간 좌표 HUD 표시
    var crossX = document.createElement('div');
    crossX.className = 'crosshair-x';
    var crossY = document.createElement('div');
    crossY.className = 'crosshair-y';
    mapContainer.appendChild(crossX);
    mapContainer.appendChild(crossY);

    var liveCoordsText = document.getElementById('live-coordinates');

    kakao.maps.event.addListener(map, 'mousemove', function(mouseEvent) {
        if(liveCoordsText) {
            var latlng = mouseEvent.latLng;
            liveCoordsText.innerText = latlng.getLat().toFixed(5) + ', ' + latlng.getLng().toFixed(5);
        }
    });

    kakao.maps.event.addListener(map, 'mouseout', function() {
        if(liveCoordsText) {
            liveCoordsText.innerText = '---.-----, ---.-----';
        }
    });

    // 3. 드론 마커 및 비행 경로(Polyline) 설정
    var droneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8" width="32" height="32"><path d="M21 10.999h-3.5c-.328-2.029-2.076-3.5-4.167-3.5-1.921 0-3.541 1.258-4.041 3H2.835C1.849 10.499 1 11.312 1 12.333c0 1.02.849 1.833 1.835 1.833H9.29c.498 1.741 2.119 3 4.041 3 2.09 0 3.839-1.471 4.167-3.5H21c1.103 0 2-.897 2-2s-.897-2-2-2zm-7.667 2.833c-1.196 0-2.167-.971-2.167-2.167s.971-2.167 2.167-2.167 2.167.971 2.167 2.167-.971 2.167-2.167 2.167z"/></svg>`;
    var droneIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(droneSvg);

    var imageSize = new kakao.maps.Size(32, 32); 
    var imageOption = {offset: new kakao.maps.Point(16, 16)}; 
    var droneMarkerImage = new kakao.maps.MarkerImage(droneIconUrl, imageSize, imageOption);

    droneMarker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(37.46083, 126.91941),
        image: droneMarkerImage,
        map: map
    });

    flightPath = new kakao.maps.Polyline({
        map: map,
        path: [],
        strokeWeight: 3, 
        strokeColor: '#38bdf8',
        strokeOpacity: 0.8,
        strokeStyle: 'solid'
    });

    // 4. 지도 클릭 시 타겟 마커(TGT) 생성 및 출동 확인 팝업
    var dispatchOverlay = null; 

    window.closeDispatchPopup = function() {
        if (dispatchOverlay) {
            dispatchOverlay.setMap(null);
        }
        var searchBar = document.getElementById('address-input');
        if (searchBar && searchBar.parentElement) {
            searchBar.parentElement.style.zIndex = '2';
        }
    };

    kakao.maps.event.addListener(map, 'click', function(mouseEvent) {        
        var latlng = mouseEvent.latLng; 
        var lat = latlng.getLat();
        var lon = latlng.getLng();

        map.panTo(latlng);

        if (targetMarker) {
            targetMarker.setPosition(latlng);
        } else {
            targetMarker = new kakao.maps.Marker({
                position: latlng,
                map: map
            });
        }

        window.targetWaypoint = { lat: lat, lon: lon };
        
        var tgtCoords = document.getElementById('target-coords');
        if(tgtCoords) tgtCoords.value = lat.toFixed(5) + ", " + lon.toFixed(5);
        
        if (typeof addLog === "function") {
            addLog(`📍 목표 지점 클릭 설정됨: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        }

        if (dispatchOverlay) {
            dispatchOverlay.setMap(null);
        }

        var searchBar = document.getElementById('address-input');
        if (searchBar && searchBar.parentElement) {
            searchBar.parentElement.style.zIndex = '0';
        }

        geocoder.coord2Address(lon, lat, function(result, status) {
            var addressText = "주소 정보 없음 (산악/해상 등)";
            if (status === kakao.maps.services.Status.OK) {
                addressText = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
            }

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

            ['click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'].forEach(function(eventType) {
                content.addEventListener(eventType, function(event) {
                    event.stopPropagation();
                });
            });

            dispatchOverlay = new kakao.maps.CustomOverlay({
                position: latlng,
                content: content,
                yAnchor: 1.35,
                zIndex: 9999
            });

            dispatchOverlay.setMap(map);

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
        }); 
    });

    // 8. 일반/위성 버튼 설정
    var btnOsm = document.getElementById('btn-map-osm');
    var btnSat = document.getElementById('btn-map-sat');

    if (btnOsm && btnSat) {
        btnOsm.addEventListener('click', function() {
            map.setMapTypeId(kakao.maps.MapTypeId.ROADMAP); 
            btnOsm.className = 'btn-blue';
            btnSat.className = 'btn-gray';
        });

        btnSat.addEventListener('click', function() {
            map.setMapTypeId(kakao.maps.MapTypeId.HYBRID); 
            btnOsm.className = 'btn-gray';
            btnSat.className = 'btn-blue';
        });
    }

    // 9. 카카오맵 마우스 십자선 추적
    var vLine = mapContainer.querySelector('.crosshair-y');
    var hLine = mapContainer.querySelector('.crosshair-x');

    mapContainer.addEventListener('mousemove', function(e) {
        if(vLine) vLine.style.display = 'block';
        if(hLine) hLine.style.display = 'block';
        var rect = mapContainer.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        if(vLine) vLine.style.left = x + 'px';
        if(hLine) hLine.style.top = y + 'px';
    });

    mapContainer.addEventListener('mouseleave', function() {
        if(vLine) vLine.style.display = 'none';
        if(hLine) hLine.style.display = 'none';
    });
}); // DOMContentLoaded 끝

// 5. 드론 위치 실시간 이동 함수 (수정됨)
function moveMarker(lat, lon) {
    if(!map || !droneMarker || !flightPath) return; 
    
    var newLatLng = new kakao.maps.LatLng(lat, lon);
    droneMarker.setPosition(newLatLng);
    
    // 👇 관제사가 지도를 편하게 드래그할 수 있도록, 최초 1회만 드론 위치로 화면을 강제 이동시킵니다.
    if (isFirstLocation) {
        map.setCenter(newLatLng);
        isFirstLocation = false;
    }
    
    var path = flightPath.getPath();
    path.push(newLatLng);
    flightPath.setPath(path);
}

// 6. 장소/주소 통합 검색 기능 
function searchAddress() {
    if(!map || !geocoder) return;
    
    var ps = new kakao.maps.services.Places();
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

            if (targetMarker) {
                targetMarker.setPosition(coords);
            } else {
                targetMarker = new kakao.maps.Marker({
                    map: map,
                    position: coords
                });
            }

            window.targetWaypoint = { lat: lat, lon: lon };
            
            var tgtCoords = document.getElementById('target-coords');
            if(tgtCoords) tgtCoords.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            
            if (typeof addLog === "function") {
                addLog(`📍 장소 검색으로 목표 지점 설정됨: ${query} (${data[0].place_name})`);
            }
            
        } else {
            alert("검색 결과가 없습니다. 올바른 주소나 건물명으로 다시 검색해보세요.");
        }
    });
}

// 10. 팝업 영역 마우스 커서 강제 복구
document.addEventListener("mousemove", function(e) {
    var mapContainer = document.getElementById('map');
    var popup = document.querySelector('.dispatch-popup');
    if (!mapContainer) return;

    if (popup && popup.contains(e.target)) {
        mapContainer.style.cursor = 'default';
        var xLine = mapContainer.querySelector('.crosshair-x');
        var yLine = mapContainer.querySelector('.crosshair-y');
        if (xLine) xLine.style.display = 'none';
        if (yLine) yLine.style.display = 'none';
    } else {
        mapContainer.style.cursor = 'crosshair';
    }
});