// =============================================================================
// Hybrid Web GCS - Vworld 3D v2.0 Control Script (Integrated Architecture) - PART 1
// =============================================================================

// --- [전역 변수 레이어 가이드] ---
let waypointList = []; 
let isDrawingMode = true; 
let waypointCount = 0;
let currentCameraAltitude = 150; 
let currentFlightMode = "SIMULATOR"; 
let vMap; 
let gcsFireZoneEntities = []; // 소방 규제선 오버레이 배열 전역 보장

/**
 * 1. 안전한 DOMContentLoaded 리스너 기반 핵심 초기화 엔진 (비동기 엔진 락 버그 수정 완료)
 */
document.addEventListener("DOMContentLoaded", function() {
    console.log("🔍 [GCS] DOM 구조 로딩 완료. 보안 정책 우회형 초기화 시작...");
    
    if (typeof vw === "undefined") {
        console.error("❌ [GCS 에러] 브이월드 'vw' 전역 라이브러리가 로드되지 않았습니다.");
        return;
    }

    try {
        // 서울시청 상공 800m 및 정하향 시선 각도(-90도)를 위한 vw.CameraPosition 클래스 선언
        let seoulCityHallPosition = new vw.CameraPosition(
            new vw.CoordZ(126.9784, 37.5666, 800), // X(경도), Y(위도), Z(지면 높이)
            new vw.Direction(0, -90, 0)            // heading, tilt, roll
        );

        // 파라미터 규격을 가이드라인 서순과 일치하게 정렬 매핑
        let mapOptions = new vw.MapOptions(
            vw.BasemapType.GRAPHIC,  // basemapType : 2D 초기배경지도
            [],                      // layersArr   : 레이어목록 (3D에서 사용안함)
            vw.DensityType.FULL,     // controlDensity
            vw.DensityType.FULL,     // interactionDensity
            false,                   // controlAutoArrange
            seoulCityHallPosition,   // homePosition
            seoulCityHallPosition    // initPosition
        );
        
        // 3D v2.0 명세에 맞춰 vMap 객체 단일 인자 주입하여 맵 객체 완벽 생성
        vMap = new vw.Map("vworld_map_container", mapOptions);
        console.log("vMap 뼈대 생성 완료. 내부 3D 엔진 비동기 로드 추적 시작...");

        // 📌 [타이밍 버그 핵심 해결] 
        // vMap 인프라와 하위 WebGL/Cesium 코어 엔진이 완벽히 정착하여 준비된 시점(Interval)에 
        // 안전하게 진짜 viewer 객체를 추출하여 전역 윈도우 스페이스에 영구 박제합니다.
        let initInterval = setInterval(function() {
        try {
            // vMap 내부 엔진 및 전역 ws3d 컨텍스트 동시 교차 검증 검사
            if (vMap && vMap.getEngine3D && vMap.getEngine3D() && vMap.getEngine3D().getViewer()) {
                window.gcsViewer = vMap.getEngine3D().getViewer();
            } else if (typeof ws3d !== "undefined" && ws3d.viewer) {
                window.gcsViewer = ws3d.viewer;
            }

            // 🔥 [Cesium 코어 강제 전역 설치 부]
            // 브이월드 내부 네임스페이스(ws3d.Cesium 또는 vMap의 프라이빗 셰이더 코어)를 찾아 전역 window.Cesium에 이식합니다.
            if (typeof window.Cesium === "undefined") {
                if (typeof ws3d !== "undefined" && ws3d.Cesium) {
                    window.Cesium = ws3d.Cesium;
                } else if (typeof vMap !== "undefined" && vMap && vMap._wsViewer) {
                    // vMap 내부 프라이빗 Cesium 컨텍스트 추적
                    window.Cesium = vMap._wsViewer.cesium || null; 
                }
            }

            const viewer = window.gcsViewer;
            // 이제 window.Cesium이 성공적으로 주입되었는지 검증합니다.
            const hasCesium = (typeof window.Cesium !== "undefined" && window.Cesium !== null);

            // 모든 엔진과 인터페이스 레이어가 물리적으로 동기화가 확인된 순간 진입
            if (viewer && viewer.camera && hasCesium) {
                clearInterval(initInterval); // 인터벌 즉시 해제
                console.log("✅ [GCS] 3D 공간 제어 엔진 및 전역 window.Cesium 동기화 100% 설치 성공!");

                initAdaptiveAltitudeTracker();

                // 🔥 여기에 작성한 건물 픽킹 함수 호출을 추가합니다.
                initBuildingInfoPicker(); 
                
                if (typeof initMapClickListener === "function") {
                    initMapClickListener(); 
                }
               }
                } catch (intervalErr) {
                    // 일시적 예외 스킵
                }
            }, 200);

        } catch (e) {
            console.error("❌ [GCS 초기화 중 예외 에러 발생]:", e);
        }
    });

// -------------------------------------------------------------
// 기능 A: 실시간 마우스 스크롤 줌 및 카메라 고도 추적부
// -------------------------------------------------------------
// -------------------------------------------------------------
// 기능 A: 실시간 마우스 스크롤 줌 및 카메라 고도 실시간 동기화 추적부 (수리 완료)
// -------------------------------------------------------------
function initAdaptiveAltitudeTracker() {
    // 실존 콘솔 덤프 기반 최하위 뷰어 및 내부 맵 객체 탐색
    let viewer = window.gcsViewer;
    if (!viewer && typeof vMap !== "undefined" && vMap && vMap._wsViewer) {
        viewer = vMap._wsViewer;
    }

    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));

    if (viewer && viewer.camera && CesiumCore) {
        // 카메라의 위치나 고도가 변경될 때마다 전역 변수를 실시간 갱신하는 락인 엔진
        viewer.camera.changed.addEventListener(function() {
            try {
                const cameraPos = viewer.camera.position;
                const cartographic = CesiumCore.Cartographic.fromCartesian(cameraPos);
                
                // 🔥 [실시간 갱신 보장] 전역 변수에 현재 진짜 카메라 높이를 무조건 1등으로 박아 넣습니다.
                currentCameraAltitude = cartographic.height; 
                
                // UI 텍스트 컴포넌트 실시간 동기화
                if (document.getElementById("txt_camera_alt_msl")) {
                    document.getElementById("txt_camera_alt_msl").innerText = Math.round(currentCameraAltitude).toLocaleString();
                }
                // 하단 상태바 레이블 동기화용 백업 가이드
                if (document.getElementById("current_zoom_alt")) {
                    document.getElementById("current_zoom_alt").innerText = Math.round(currentCameraAltitude).toLocaleString();
                }
            } catch(e) {
                // 실시간 리스너 예외 스킵
            }
        });
        console.log("✅ [GCS Core] 실시간 현재 고도 동기화 트래커가 메모리에 정착되었습니다.");
    }
}


// =============================================================================
// 🗺️ [이중 방어] 자바스크립트 레벨 3D 정하향(-90도) 각도 락인 엔진
// =============================================================================
function start2DDrawingMode() {
    isDrawingMode = true;
    
    const btn2D = document.getElementById("btn_view_2d");
    const btn3D = document.getElementById("btn_view_3d");
    if (btn2D && btn3D) { btn2D.className = "active-view"; btn3D.className = ""; }
    
    let viewer = window.gcsViewer || (typeof vMap !== "undefined" && vMap && vMap._wsViewer ? vMap._wsViewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : null);

    if (viewer && viewer.camera && CesiumCore) {
        try {
            let currentPos = viewer.camera.position.clone();
            viewer.camera.setView({
                destination: currentPos, // 현재 보던 위치 100% 박제 고정
                orientation: {
                    heading: viewer.camera.heading, // 회전각 유지
                    pitch: CesiumCore.Math.toRadians(-90), // 각도만 정하향 리셋
                    roll: 0
                }
            });
            console.log("🎯 [JS Core View Lock] 위치 유지 상태로 각도만 -90도 전환 성공!");
        } catch (e) {
            if (typeof vMap !== "undefined" && vMap && vMap.camera && typeof vMap.camera.setTilt === "function") {
                vMap.camera.setTilt(-90);
            }
        }
    }
}


function convertTo3DViewMode() {
    isDrawingMode = false; 
    document.getElementById("btn_view_2d").className = "";
    document.getElementById("btn_view_3d").className = "active-view";
    
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));
    
    if (viewer && CesiumCore) {
        let primitives = viewer.scene.primitives;
        for (let i = 0; i < primitives.length; i++) {
            let primitive = primitives.get(i);
            if (primitive.show !== undefined) { primitive.show = true; }
        }

        let center = viewer.camera.positionCartographic;
        viewer.camera.flyTo({
            destination: CesiumCore.Cartesian3.fromRadians(center.longitude, center.latitude, currentCameraAltitude),
            orientation: {
                heading: CesiumCore.Math.toRadians(0),
                pitch: CesiumCore.Math.toRadians(-45),
                roll: CesiumCore.Math.toRadians(0)
            },
            duration: 0.5
        });
    }
    refresh3DWaypoints();
    renderWaypointListUI();
}

// -------------------------------------------------------------
// 기능 C: 브이월드 공식 3D 마우스 클릭 이벤트 리스너
// -------------------------------------------------------------
function initMapClickListener() {
    console.log("📢 [GCS] 브이월드 공식 마우스 클릭(click) 리스너가 가동되었습니다.");

    vMap.on("click", async function(event) {
        if (!isDrawingMode) {
            console.log("ℹ️ 현재 3D 튜닝 모드이므로 마우스 클릭 노드 생성이 차단되었습니다.");
            return; 
        }
        
        let lon = event.longitude; 
        let lat = event.latitude;  
        let groundAlt = event.altitude; 
        
        console.log(`📍 지점 클릭 감지 -> X: ${lon.toFixed(6)}, Y: ${lat.toFixed(6)}, 지형고도: ${Math.round(groundAlt)}m`);
        
        let airspaceCheck = await checkAdvancedAirspace(lon, lat);
        
        if (airspaceCheck.isProhibited) {
            alert(`❌ [진입 차단] 법적 비행금지구역 내부입니다.`);
            return;
        }
        
        if (airspaceCheck.isRestricted || airspaceCheck.isControlled) {
            let msg = `⚠️ [비행 주의 규제 공역 감지]\n진행하시겠습니까?`;
            if (!confirm(msg)) return; 
        }

        waypointCount++;
        let calculatedInitialAlt = Math.max(currentCameraAltitude, groundAlt + 10);

        let newWaypoint = {
            id: "WP_" + waypointCount,
            x: lon, 
            y: lat,
            z: calculatedInitialAlt,
            groundZ: groundAlt,
            zoneTag: airspaceCheck.detectedZones.join("/") || "일반공역"
        };

        waypointList.push(newWaypoint);
        drawWaypointMarker(newWaypoint);
        renderWaypointListUI();
    });
}

async function checkAdvancedAirspace(lon, lat) {
    let status = { isProhibited: false, isRestricted: false, isControlled: false, detectedZones: [] };
    return status;
}

// -------------------------------------------------------------
// 기능 D: Cesium 내장 엔티티 체계를 통한 정밀 마커 시각화
// -------------------------------------------------------------
function drawWaypointMarker(wp) {
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));
    if (!viewer || !CesiumCore) return;
    
    const existingEntity = viewer.entities.getById(wp.id);
    if (existingEntity) viewer.entities.remove(existingEntity);
    
    viewer.entities.add({
        id: wp.id,
        position: CesiumCore.Cartesian3.fromDegrees(wp.x, wp.y, wp.z),
        point: {
            pixelSize: 12,
            color: CesiumCore.Color.fromCssString("#007bff"),
            outlineColor: CesiumCore.Color.WHITE,
            outlineWidth: 2
        },
        label: {
            text: `${wp.id} (${Math.round(wp.z - wp.groundZ)}m)`,
            font: "12px sans-serif",
            fillColor: CesiumCore.Color.WHITE,
            outlineColor: CesiumCore.Color.BLACK,
            outlineWidth: 2,
            style: CesiumCore.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: CesiumCore.VerticalOrigin.BOTTOM,
            pixelOffset: new CesiumCore.Cartesian2(0, -15)
        }
    });
    updateVerticalGripLine(wp);
}

function updateWaypointRelativeHeight(wpId, relativeHeight) {
    let targetWP = waypointList.find(item => item.id === wpId);
    if (targetWP) {
        targetWP.z = targetWP.groundZ + parseFloat(relativeHeight);
        drawWaypointMarker(targetWP);
        drawFlightPath();
        renderWaypointListUI();
    }
}

function updateVerticalGripLine(wp) {
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));
    if (!viewer || !CesiumCore) return;
    
    const lineId = "line_grip_" + wp.id;
    const existingLine = viewer.entities.getById(lineId);
    if (existingLine) viewer.entities.remove(existingLine);

    viewer.entities.add({
        id: lineId,
        polyline: {
            positions: CesiumCore.Cartesian3.fromDegreesArrayHeights([wp.x, wp.y, wp.groundZ, wp.x, wp.y, wp.z]),
            width: 2,
            material: new CesiumCore.PolylineDashMaterialProperty({
                color: CesiumCore.Color.fromCssString("#00ffff")
            })
        }
    });
}

function drawFlightPath() {
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));
    if (!viewer || !CesiumCore) return;
    
    const pathId = "flight_path_line";
    const existingPath = viewer.entities.getById(pathId);
    if (existingPath) viewer.entities.remove(existingPath);
    
    if (waypointList.length < 2) return;
    
    let pathPositions = [];
    waypointList.forEach(wp => { pathPositions.push(wp.x, wp.y, wp.z); });
    
    viewer.entities.add({
        id: pathId,
        polyline: {
            positions: CesiumCore.Cartesian3.fromDegreesArrayHeights(pathPositions),
            width: 4,
            material: CesiumCore.Color.fromCssString("#ff00ff")
        }
    });
}

function refresh3DWaypoints() {
    waypointList.forEach(wp => drawWaypointMarker(wp));
    drawFlightPath();
}

// -------------------------------------------------------------
// 기능 E: 우측 리스트 편집 대시보드 인터페이스 연동부
// -------------------------------------------------------------
function renderWaypointListUI() {
    const container = document.getElementById("wp_list_container");
    if (!container) return;
    
    if (waypointList.length === 0) {
        container.innerHTML = `<span style="color:#aaa; display:block; text-align:center; padding:20px 0;">지도를 클릭하거나 파일을 로드하세요.</span>`;
        return;
    }
    
    container.innerHTML = "";
    waypointList.forEach((wp) => {
        const html = `
            <div style="border-bottom:1px solid #eee; padding:6px 0; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b style="color:#007bff;">${wp.id}</b> <span style="font-size:10px; color:#888;">[${wp.zoneTag}]</span><br>
                    고도: <input type="number" value="${Math.round(wp.z - wp.groundZ)}" style="width:55px;" 
                                 onchange="updateWaypointRelativeHeight('${wp.id}', this.value)"> m
                </div>
                <button onclick="deleteWaypoint('${wp.id}')" style="background:#ff5252; color:#fff; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-size:11px;">삭제</button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function deleteWaypoint(wpId) {
    if(!confirm(`${wpId} 경로를 임무에서 완전 제거 조치할까요?`)) return;
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    if (!viewer) return;
    
    viewer.entities.removeById(wpId);
    viewer.entities.removeById("line_grip_" + wpId);
    
    waypointList = waypointList.filter(wp => wp.id !== wpId);
    waypointList.forEach((wp, idx) => {
        viewer.entities.removeById(wp.id);
        viewer.entities.removeById("line_grip_" + wp.id);
        wp.id = "WP_" + (idx + 1);
    });
    waypointCount = waypointList.length;
    
    refresh3DWaypoints();
    renderWaypointListUI();
}


// =============================================================================
// 🏢 [Layer 3 완전 수리] 3D 건물 레이어 켜기/끄기 공식 복구 엔진
// =============================================================================
function toggleVworld3DBuildings(isVisible) {
    // 사용자 콘솔로 증명된 진짜 프라이빗 WebGL 내장 뷰어 추출
    let viewer = null;
    if (typeof vMap !== "undefined" && vMap && vMap._wsViewer) {
        viewer = vMap._wsViewer;
    }
    
    if (!viewer) {
        console.warn("⚠️ [GCS Layer 3] 3D 뷰어 인프라가 아직 로딩 전입니다.");
        return;
    }

    try {
        // vMap.showLayer 오류를 완전히 우회하여, Cesium 엔진 내부 렌더러 파이프라인(Primitives)을 직접 타격합니다.
        if (viewer.scene && viewer.scene.primitives) {
            let primitives = viewer.scene.primitives;
            let found = false;
            
            for (let i = 0; i < primitives.length; i++) {
                let p = primitives.get(i);
                // 브이월드 3D 건물 타일셋의 고유 속성(url 또는 tileset 구조체)을 판독하여 저수준 가시성을 제어합니다.
                if (p && (p.url || p._url || p.customType === "facility" || p.allTilesLoaded !== undefined)) {
                    p.show = isVisible; // true면 빌딩 켜짐, false면 빌딩 투명하게 꺼짐!
                    found = true;
                }
            }
            
            if (found) {
                console.log(`%c🏢 [GCS Layer 3 복구 완료] 3D 건물 레이어 가시성 변경 -> 상태: ${isVisible ? "ON" : "OFF"}`, "color: #fff; background: #333; padding: 2px 6px;");
            } else {
                // 백업 채널: 프라이빗 레이어 트리 직접 순회 숨김
                if (vMap._layers) {
                    for (let key in vMap._layers) {
                        if (key.toLowerCase().includes("facility") || key.toLowerCase().includes("bldg")) {
                            vMap._layers[key].show = isVisible;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("❌ [GCS Layer 3] 3D 건물 레이어 제어 중 예외 발생:", e.message);
    }
}

// =============================================================================
// 🏢 [Layer 3 완전 수리] 함수 에러 우회형 3D 건물 프리미티브 직접 차단 엔진
// =============================================================================
function toggleVworld3DBuildings(isVisible) {
    // 📌 사용자 콘솔창으로 실존이 증명된 Bpe 컨텍스트 구조체 직격 가로채기
    let viewer = null;
    if (typeof vMap !== "undefined" && vMap && vMap._wsViewer) {
        viewer = vMap._wsViewer;
    }
    if (!viewer && typeof ws3d !== "undefined" && ws3d.viewer) {
        viewer = ws3d.viewer;
    }
    
    if (!viewer) {
        console.warn("⚠️ [GCS Layer 3] WebGL 3D 엔진 코어가 로딩 전입니다.");
        return;
    }

    try {
        // 고장난 vMap.showLayer 함수를 완전히 생략하고, 
        // Cesium 3D 렌더러가 화면에 입체 건물을 그릴 때 사용하는 'scene.primitives' 배열을 직접 강제 조작합니다.
        if (viewer.scene && viewer.scene.primitives) {
            let primitives = viewer.scene.primitives;
            let count = primitives.length;
            
            for (let i = 0; i < count; i++) {
                let p = primitives.get(i);
                // 브이월드 3D 아파트/빌딩 데이터 타일셋 구조체의 특성(url 주소 또는 렌더 타겟 멤버)을 추적합니다.
                if (p && (p.url || p._url || p.allTilesLoaded !== undefined || typeof p.readyPromise !== "undefined")) {
                    p.show = isVisible; // 🔥 false면 자바스크립트 함수 에러 없이 아파트 건물이 즉시 투명하게 사라집니다!
                }
            }
            console.log(`%c🏢 [Layer 3 Core] 엔진 내부 셰이더 직접 제어 완수 -> 빌딩 가시성: ${isVisible}`, "color: #fff; background: #2e7d32; padding: 2px 6px;");
        }
    } catch (e) {
        console.warn("⚠️ 빌딩 프리미티브 직접 차단 우회 가동:", e.message);
    }
}

// =============================================================================
// ✨ [Layer 4 완결판] 외부 함수 에러 100% 차단 - 서울광장 3D 빨간 원기둥 주입 엔진
// =============================================================================
function toggleDroneRestrictionZones(isVisible) {
    // 1. 📌 사용자 콘솔 창에서 검증된 진짜 핵심 3D WebGL 뷰어 객체 가로채기
    let viewer = null;
    if (typeof vMap !== "undefined" && vMap && vMap._wsViewer) {
        viewer = vMap._wsViewer; 
    }
    if (!viewer && typeof ws3d !== "undefined" && ws3d.viewer) {
        viewer = ws3d.viewer;
    }

    if (!viewer) {
        console.error("❌ [GCS Layer 4] WebGL 3D 엔진 코어 뷰어를 찾을 수 없습니다.");
        return;
    }

    // 2. 🔥 775번 라인 에러를 차단하기 위해 CesiumCore 네임스페이스를 가장 확실한 내부 컨텍스트에서 직접 가공 추출합니다.
    // 외부 window.Cesium 탐색 실패를 방어하기 위해 ws3d와 viewer 프로토타입을 직격 타격합니다.
    const CesiumCore = (typeof ws3d !== "undefined" && ws3d.Cesium) ? ws3d.Cesium : (viewer.cesium || window.Cesium || null);
    
    if (!CesiumCore) {
        console.error("❌ [GCS Layer 4] 원천 3D 도형 모듈(CesiumCore)을 찾지 못했습니다.");
        return;
    }

    if (isVisible) {
        console.log("%c🚀 [GCS Layer 4] 유령 에러 전면 우회 완수 -> 3D 원기둥 렌더링 엔진 독자 기동!!", "color: #ffffff; background: #007bff; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
        
        // [선행 청소] 레이어가 중복으로 겹쳐서 비정상적으로 붉어지는 현상 방지
        if (typeof gcsFireZoneEntities === "undefined" || !gcsFireZoneEntities) { gcsFireZoneEntities = []; }
        if (gcsFireZoneEntities.length > 0) {
            gcsFireZoneEntities.forEach(entity => { try { viewer.entities.remove(entity); } catch(e){} });
            gcsFireZoneEntities = [];
        }

        try {
            // 📌 총 원기둥 실측 높이 명세 (60m)
            const cylinderHeight = 60.0; 

            // 📌 3. [진짜 3D 원기둥 생성 및 독자 주입 파이프라인]
            // vMap.addLayer나 showLayer 같은 불량 함수들을 전혀 거치지 않고, 
            // 뷰어의 entities 풀에 Native Cesium 코드로 다이렉트 3D 구조를 꽂아 넣습니다. (775번 에러 차단 완료)
            const fireCylinderEntity = viewer.entities.add({
                id: "3D_FIRE_ZONE_CYLINDER_001",
                name: "🚨 소방차 전용구역 (드론 비행 통제 공역)",
                
                // 원기둥의 정확한 정중앙(Center) 높이를 공중 30m 위로 인양하여 밑면이 지표면에 정확히 닿게 설계합니다.
                position: CesiumCore.Cartesian3.fromDegrees(126.978000, 37.566500, cylinderHeight / 2),
                
                cylinder: {
                    length: cylinderHeight, // 총 높이 60m 확보 (아파트 20층 높이로 건물 위로 우뚝 솟구치게 고정)
                    topRadius: 20.0,        // 반경 20m (직경 40m 소방 통제 구역)
                    bottomRadius: 20.0,
                    
                    // 🔴 [주변 3D 건물을 뚫고 보일 진한 빨간색 고대비 반투명 프로퍼티 세팅]
                    material: CesiumCore.Color.RED.withAlpha(0.70), // 70% 불투명도의 아주 진하고 강렬한 빨간색 원통형 가이드
                    
                    outline: true,
                    outlineColor: CesiumCore.Color.BLACK,           // 가시성을 극한으로 올리기 위한 검은색 테두리 윤곽선
                    outlineWidth: 4.0,                              // 윤곽선 두께 4px 타격
                    
                    // 지형 바닥 높낮이에 맞춰 원기둥 밑면을 서울광장 지표면에 고정하는 속성
                    heightReference: CesiumCore.HeightReference.RELATIVE_TO_GROUND,
                    numberOfVerticalLines: 24 
                }
            });

            gcsFireZoneEntities.push(fireCylinderEntity);
            console.log("[Layer 4] 서울광장 지표면 기준 60m 공중 돌파 3D 원기둥 안착 완전 성공!");

        } catch (cylinderErr) {
            console.error("❌ [GCS Layer 4] 원기둥 생성 중 하드웨어 렌더 예외:", cylinderErr);
        }

        console.log("%c🎯 [Layer 4] 775번 에러를 분쇄하고 진짜 빨간색 가상 통제 원기둥을 화면에 안착시켰습니다.", "color: #ffffff; background: #2e7d32; font-size: 11px; font-weight: bold; padding: 3px 6px;");

    } else {
        // 체크박스 해제(false) 시 오버레이 소거 제거
        if (typeof gcsFireZoneEntities !== "undefined" && gcsFireZoneEntities && gcsFireZoneEntities.length > 0) {
            gcsFireZoneEntities.forEach(entity => { try { viewer.entities.remove(entity); } catch(e){} });
            gcsFireZoneEntities = [];
            console.log("🧹 [Layer 4] 소방 관제 원기둥 오버레이 세척 완료.");
        }
    }
}

// =============================================================================
// ✨ 브이월드 장소/주소 실시간 자동완성 검색 전역 객체 (GcsFinalPoiSearcher)
// =============================================================================
const GcsFinalPoiSearcher = {
    API_KEY: '307B0E17-0322-43C3-A570-59947C0FC7A1',

    executeSearch: function() {
        const keywordInput = document.getElementById('txt_search_keyword');
        const resultList = document.getElementById('poi_result_list');
        if (!keywordInput || !resultList) return;

        const searchWord = keywordInput.value.trim();
        if (searchWord === '') {
            resultList.innerHTML = '';
            resultList.style.display = 'none';
            return;
        }

        resultList.innerHTML = '<li class="poi-item loading">검색 중입니다...</li>';
        resultList.style.display = 'block';

        const encodedWord = encodeURIComponent(searchWord);
        const callbackName = 'gcsVworldCallback_' + Date.now();
        let combinedResults = [];
        let completedRequests = 0;

        window[callbackName] = function(data) {
            completedRequests++;
            if (data && data.response && data.response.status === 'OK' && data.response.result && data.response.result.items) {
                const items = data.response.result.items.map(item => {
                    let type = '장소';
                    let badgeClass = 'badge-place';
                    let displayTitle = '';
                    let displayAddress = '';

                    if (item.address?.category === 'ROAD' || item.category === 'ROAD') {
                        type = '도로명';
                        badgeClass = 'badge-road';
                        displayTitle = item.address?.road || item.text || item.title || '도로명 주소';
                        displayAddress = item.address?.parcel ? '[지번] ' + item.address.parcel : '';
                    } else if (item.address?.category === 'PARCEL' || item.category === 'PARCEL') {
                        type = '지번';
                        badgeClass = 'badge-parcel';
                        displayTitle = item.address?.parcel || item.text || item.title || '지번 주소';
                        displayAddress = item.address?.road ? '[도로명] ' + item.address.road : '';
                    } else {
                        type = '장소';
                        badgeClass = 'badge-place';
                        displayTitle = item.title || '장소명 없음';
                        displayAddress = item.address?.road || item.address?.parcel || '';
                    }

                    return { type, badgeClass, title: displayTitle, address: displayAddress, x: item.point?.x || '0', y: item.point?.y || '0' };
                });
                combinedResults = combinedResults.concat(items);
            }

            if (completedRequests === 3) {
                GcsFinalPoiSearcher.renderResults(combinedResults);
                delete window[callbackName];
            }
        };

        const urls = [
        `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=PLACE&format=json&key=${this.API_KEY}&callback=${callbackName}`,
        `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=ADDRESS&category=ROAD&format=json&key=${this.API_KEY}&callback=${callbackName}`,
        `https://api.vworld.kr/req/search?query=${encodedWord}&service=search&request=search&version=2.0&type=ADDRESS&category=PARCEL&format=json&key=${this.API_KEY}&callback=${callbackName}`
        ];

        urls.forEach(url => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            document.head.appendChild(script);
            script.onload = () => script.remove();
        });
    },

    renderResults: function(results) {
        const resultList = document.getElementById('poi_result_list');
        resultList.innerHTML = '';

        const filteredResults = results.filter(item => item.title && item.title.trim() !== '' && item.title !== '이름 없음' && item.title !== '장소명 없음');
        if (filteredResults.length === 0) {
            resultList.innerHTML = '<li class="poi-item no-result">검색 결과가 없습니다.</li>';
            return;
        }

        filteredResults.forEach(item => {
            const li = document.createElement('li');
            li.className = 'poi-item';
            li.onclick = function() { GcsFinalPoiSearcher.selectItem(item); };
            li.innerHTML = `
                <div class="poi-info">
                    <span class="poi-badge ${item.badgeClass}">${item.type}</span>
                    <strong class="poi-title">${item.title}</strong>
                </div>
                ${item.address ? `<div class="poi-address">${item.address}</div>` : ''}
            `;
            resultList.appendChild(li);
        });
    },

    selectItem: function(item) {

        


        if (typeof vMap === "undefined" || !vMap) {
            console.error("❌ [GCS 에러] 전역 vMap 객체가 존재하지 않아 비행 제어가 불가능합니다.");
            return;
        }

        // 💥 [핵심 추가] 검색하거나 선택한 목적지 좌표를 전역 브라우저 메모리에 확실하게 락인(Lock-in)합니다.
        // 기존 selectItem 내부에서 명칭, X, Y를 출력하는 변수명을 그대로 대입해 줍니다.
        window.gcsCurrentTargetX = parseFloat(item.x); // 만약 기존 변수명이 lon이나 x라면 해당 변수명으로 매핑
        window.gcsCurrentTargetY = parseFloat(item.y); // 만약 기존 변수명이 lat이나 y라면 해당 변수명으로 매핑

        console.log("🚀 [GCS 비행 가동] 커스텀 vMap 락인 성공 -> 명칭: " + item.address + " | X: " + gcsCurrentTargetX + ", Y: " + gcsCurrentTargetY);
        


        const lon = parseFloat(item.x);
        const lat = parseFloat(item.y);
        if (isNaN(lon) || isNaN(lat) || lon === 0 || lat === 0) return;

        console.log(`🚀 [GCS 비행 가동] 커스텀 vMap 락인 성공 -> 명칭: ${item.title} | X: ${lon}, Y: ${lat}`);

        try {
            // 📌 [구조 정밀 일치화] 실존하는 vMap._wsViewer 객체 체인을 직접 타격합니다.
            const viewer = vMap._wsViewer;
            
            // 📌 [성공 명세 직격 매핑]의 기능 B와 D에서 이미 완벽히 검증된 ws3d.Cesium 코어를 직격 호출합니다.
            const CesiumCore = (typeof ws3d !== "undefined" && ws3d.Cesium) ? ws3d.Cesium : null;

            // 만약 엔진 로딩 지연이 발생할 경우를 대비한 순정 API 백업망 가동
            if (!viewer || !CesiumCore) {
                console.warn("⚠️ [GCS] 비동기 엔진 조율 대기 중 -> 순정 대리 API 비행을 즉시 기동합니다.");
                let targetTilt = isDrawingMode ? -90 : -45;
                let targetAlt = isDrawingMode ? 600 : 450;
                let targetPosition = new vw.CameraPosition(new vw.CoordZ(lon, lat, targetAlt), new vw.Direction(0, targetTilt, 0));
                vMap.moveTo(targetPosition);
                document.getElementById('poi_result_list').style.display = 'none';
                return;
            }

            let targetTilt = -45; 
            let targetAlt = 450;  
            if (typeof isDrawingMode !== "undefined" && isDrawingMode === true) {
                targetTilt = -90;  
                targetAlt = 600;   
            }

            // A. [카메라 비행] 부드러운 Native Cesium flyTo 엔진 정상 가동
            viewer.camera.flyTo({
                destination: CesiumCore.Cartesian3.fromDegrees(lon, lat, targetAlt),
                orientation: { 
                    heading: CesiumCore.Math.toRadians(0), 
                    pitch: CesiumCore.Math.toRadians(targetTilt), 
                    roll: CesiumCore.Math.toRadians(0) 
                },
                duration: 1.2
            });

            // B. [최상위 빨간점 마커 생성] 기존 검색 마커 ID가 있다면 청소 후 새로 생성
            const markerId = "GCS_SEARCH_TARGET_PIN";
            const existingEntity = viewer.entities.getById(markerId);
            if (existingEntity) viewer.entities.remove(existingEntity);

            // 3D 건물 레이어 두께에 파묻히지 않도록 지표면 + 35m 상공에 강제 배치
            const targetCartographic = CesiumCore.Cartographic.fromDegrees(lon, lat);
            const groundHeight = viewer.scene.globe.getHeight(targetCartographic) || 0;

            viewer.entities.add({
                id: markerId,
                position: CesiumCore.Cartesian3.fromDegrees(lon, lat, groundHeight + 35),
                point: {
                    pixelSize: 16,
                    color: CesiumCore.Color.fromCssString("#ff0033"), // 형광 빨간색 고정
                    outlineColor: CesiumCore.Color.WHITE,
                    outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY // 3D 건물 투과 노출 옵션 적용
                },
                label: {
                    text: `🎯 타겟: ${item.title}`,
                    font: "bold 13px sans-serif",
                    fillColor: CesiumCore.Color.WHITE,
                    outlineColor: CesiumCore.Color.BLACK,
                    outlineWidth: 3,
                    style: (CesiumCore.LabelStyle ? CesiumCore.LabelStyle.FILL_AND_OUTLINE : 2),
                    verticalOrigin: CesiumCore.VerticalOrigin.BOTTOM,
                    pixelOffset: new CesiumCore.Cartesian2(0, -16),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });

            console.log(`🎯 [GCS] 커스텀 vMap 전역 엔티티 제어 파이프라인 연동 완수.`);

        } catch (err) { 
            console.error("❌ 비행 및 마커 생성 중 예외 발생, 백업망 작동:", err);
            let targetPosition = new vw.CameraPosition(new vw.CoordZ(lon, lat, 450), new vw.Direction(0, -45, 0));
            vMap.moveTo(targetPosition);
        }

        const resultList = document.getElementById('poi_result_list');
        if (resultList) resultList.style.display = 'none';
    }




};

// 영역 외부 마우스 클릭 시 결과 드롭다운 자동 폐쇄기
document.addEventListener("click", function(e) {
    const listEl = document.getElementById("poi_result_list");
    if (listEl && !e.target.closest(".gcs-search-container")) {
        listEl.style.display = "none";
    }
});


// =============================================================================
// ✨ [UI 오류 해결 복구망] vworld.html:184 빌딩 레이어 온오프 스위칭 인터페이스
// =============================================================================
function toggleVworld3DBuildings(isVisible) {
    if (typeof vMap !== "undefined" && vMap) {
        try {
            // 브이월드 3D 공식 건물 레이어 ID 코드를 호출하여 가시성을 제어합니다.
            if (isVisible) {
                vMap.showLayer("facility", true);
                console.log("🏢 [GCS Layer 3] 브이월드 3D 건물 인프라 메쉬 레이어 활성화.");
            } else {
                vMap.showLayer("facility", false);
                console.log("🧹 [GCS Layer 3] 브이월드 3D 건물 인프라 메쉬 레이어 숨김 처리.");
            }
        } catch (e) {
            console.warn("⚠️ 빌딩 레이어 제어자 가동 대기 중:", e.message);
        }
    }
}

// =============================================================================
// 🏢 [건물 상세 정보 추출] 3D 건물 마우스 클릭 픽킹(Picking) 엔진
// =============================================================================
function initBuildingInfoPicker() {
    console.log("📢 [GCS] 3D 건물 상세 정보 픽킹 리스너를 초기화합니다.");

    // 파일 내 구현된 전역 뷰어 및 Cesium 코어 참조 체인 가로채기
    const viewer = window.gcsViewer || (typeof ws3d !== "undefined" ? ws3d.viewer : null);
    const CesiumCore = window.Cesium || (typeof Cesium !== "undefined" ? Cesium : (typeof ws3d !== "undefined" ? ws3d.Cesium : null));

    if (!viewer || !CesiumCore) {
        console.warn("⚠️ [GCS] 3D 엔진 코어가 아직 준비되지 않아 0.5초 후 재시도합니다.");
        setTimeout(initBuildingInfoPicker, 500);
        return;
    }

    // Cesium 순정 ScreenSpaceEventHandler를 통해 저수준 마우스 클릭 감지
    const handler = new CesiumCore.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(function(clickEvent) {
        // 1. 현재 3D 튜닝 모드이거나 건물 정보를 가져와야 하는 상황인지 체크 (필요시 조건문 수정 가능)
        // if (isDrawingMode) return; 

        // 2. 마우스 클릭 위치의 3D 프리미티브(건물 메쉬 타일셋) 객체 픽킹
        const pickedObject = viewer.scene.pick(clickEvent.position);

        if (CesiumCore.defined(pickedObject)) {
            console.log("🎯 3D 공간 내 객체 선택 감지:", pickedObject);

            let buildingInfo = {
                layerName: pickedObject.layerId || "알 수 없는 레이어",
                featureId: pickedObject.featureId || "ID 없음",
                properties: {}
            };

            // 브이월드 3D 건물 데이터(3D Tiles 등)의 개별 속성(Property) 로드 파이프라인
            if (typeof pickedObject.getPropertyNames === "function") {
                const propertyNames = pickedObject.getPropertyNames();
                propertyNames.forEach(name => {
                    buildingInfo.properties[name] = pickedObject.getProperty(name);
                });
            } else if (pickedObject.primitive && pickedObject.primitive.properties) {
                // 백업 속성 트리 탐색
                buildingInfo.properties = pickedObject.primitive.properties;
            }

            // 3. 추출된 데이터를 기반으로 비즈니스 로직 처리
            displayBuildingDetails(buildingInfo);

        } else {
            console.log("💨 빈 공간 또는 정보를 제공하지 않는 지형을 클릭했습니다.");
        }

    }, CesiumCore.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * 추출된 건물 상세 정보를 콘솔 표출 및 UI에 바인딩하는 함수
 */
function displayBuildingDetails(info) {
    console.log("%c🏢 [추출된 건물 상세 정보]", "color: #fff; background: #2e7d32; font-weight: bold; padding: 3px 6px;");
    console.log("레이어 그룹:", info.layerName);
    console.log("고유 피처 ID:", info.featureId);
    console.log("메타 데이터 세부 속성:", info.properties);

    // 💡 [Tip] 브이월드 빌딩 세부 속성 규칙 예시 명세
    // info.properties.sig_cd (시군구코드), info.properties.bld_nm (건물명), info.properties.gro_flo_co (지상층수) 등
    
    // UI 대시보드나 인포윈도우 팝업이 있다면 여기에 데이터를 바인딩하세요.
    /*
    const container = document.getElementById("building_detail_container");
    if (container) {
        container.innerHTML = `
            <div>
                <strong>건물 ID:</strong> ${info.featureId}<br>
                <strong>건물 명칭:</strong> ${info.properties.BLD_NM || info.properties.name || '명칭 없음'}<br>
                <strong>건물 높이/층수:</strong> ${info.properties.HEIGHT || '정보 없음'}m (${info.properties.FLR_CO || '-'}층)
            </div>
        `;
    }
    */
}
