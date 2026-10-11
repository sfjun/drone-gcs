// =========================================================================
// 🚨 [fire.js 최초 순정 원본 마스터 - 소방방재 및 정형 3D 임무 공역 렌더링 엔진]
// =========================================================================

window.vworldDisasterLayerInstance = null;
window.gcsFireZoneEntities = [];

/**
 * 🌐 [순정 복구] 브이월드 서버 WMS 소방방재 건물 레이어 초기화 및 프록시 터널링
 */
window.initDisasterWMSLayer = function() {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    try {
        window.vworldDisasterLayerInstance = ws3d.viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
                url: "https://api.vworld.kr/req/wms",
                layers: "lt_c_spbd",
                parameters: {
                    service: "WMS",
                    version: "1.1.1",
                    request: "GetMap",
                    styles: "lt_c_spbd",
                    format: "image/png",
                    transparent: "true",
                    apiKey: "767B7AD0-A21A-3A1E-9C3D-D57B7B123456"
                },
                proxy: new Cesium.DefaultProxy("/proxy.do")
            })
        );
        window.vworldDisasterLayerInstance.show = false;
    } catch (e) {
        console.warn("⚠️ [순정 방재 로그] WMS 초기화 예외 가드 작동:", e);
    }
};

/**
 * 🎛️ [순정 복구] 소방방재 레이어 가시성 토글 및 '3D 편집' 관제 모드 화면 강제 전환 인터페이스
 */
window.toggleFireWMS = function(elementOrChecked) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    if (!window.vworldDisasterLayerInstance) window.initDisasterWMSLayer();

    var isShow = false;
    if (typeof elementOrChecked === "boolean") {
        isShow = elementOrChecked;
    } else if (elementOrChecked && typeof elementOrChecked === "object") {
        isShow = elementOrChecked.checked !== undefined ? elementOrChecked.checked : jQuery(elementOrChecked).is(":checked");
    }

    if (window.vworldDisasterLayerInstance) {
        window.vworldDisasterLayerInstance.show = isShow;
    }

    // [순정 로직 복구] 레이어가 On되는 즉시 화면을 3D 편집 탭으로 오토 점프 자동 클릭 유도
    if (isShow) {
        setTimeout(function() {
            var btn3DEdit = jQuery("button:contains('3D 편집'), div:contains('3D 편집'), a:contains('3D 편집')").last();
            if (btn3DEdit.length > 0) {
                btn3DEdit.click();
                console.log("🚀 [순정 오토 스위처] 레이어 가동 조건 감지로 인해 '3D 편집' 모드로 화면 강제 전환 완료");
            }
        }, 150);
    }
    console.log("🎛️ [순정 방재 로그] 레이어 렌더 상태 변경 -> " + (isShow ? "ON" : "OFF"));
};

/**
 * 🎯 [순정 복구] 150m 절대 고도의 화려한 3D 반투명 입체 원기둥(실린더) 임무 공역 렌더링 부 활성화
 */
window.drawFireZoneOnGround = function(lon, lat, alt, type) {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var viewer = ws3d.viewer;

    var numLon = parseFloat(lon);
    var numLat = parseFloat(lat);
    var numAlt = parseFloat(alt);

    // 🚨 [NaN 안전 필터 가드 장착] 원본 복구를 진행하되, 지도가 완전히 마비되어 검게 터지는 RangeError 현상만 든든하게 사전 필터링합니다.
    if (isNaN(numLon) || isNaN(numLat) || numLon === 0 || numLat === 0) {
        console.warn("⚠️ [GCS 안전 가드] 깨진 유령 좌표(NaN) 유입 차단으로 세슘 엔진 폭발 보호 완수");
        return;
    }

    var color = Cesium.Color.CYAN;
    var nameText = "🛸 홈 설정(0m 고정)";
    if (type === "waypoint") { 
        color = Cesium.Color.YELLOW; 
        nameText = "📍 경유지 추가(카메라 고도 반영)"; 
    } else if (type === "destination") { 
        color = Cesium.Color.RED; 
        nameText = "🎯 목적지 설정"; 
    }

    var targetAlt = (isNaN(numAlt) || numAlt <= 0.0) ? 150.0 : numAlt;
        window.gcsFireZoneEntities.forEach(function(entity) {
            ws3d.viewer.entities.remove(entity);
        });
    }
    window.gcsFireZoneEntities = [];

// 최초 기동 바인딩
setTimeout(function() {
    if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
        window.initDisasterWMSLayer();
    }
}, 1000);
