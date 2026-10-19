// =========================================================================
// 🛸 [GCS 확장 뷰어] PART 2. 시뮬레이션 타임라인 및 독립형 HUD 제어 시스템 (최종 무결성 본)
// =========================================================================

window.GcsApp = window.GcsApp || {};
window.GcsApp.SIM_CONFIG = {
    TIME_WAIT: 3.0,          // 모터 시동 대기 초
    TIME_CLIMB: 7.0,         // 수직 이륙 속도 가중치 초
    TIME_HOVER_CHECK: 8.0,   // 초기 고도 안착 호버링 점검 및 회전 시간 초
    TIME_CRUISE_STEP: 8,     // 노드 간 비행 기본 가속 배정 초
    TIME_NODE_HOVER: 3       // 중간 노드 임무 호버링 관제 시간 초
};

window.gcsSimulatedDroneEntity = null;
window.gcsMultiCamRenderListener = null;
window.gcsCameraTrackingModeActive = true;
window.isGcsLayoutSwapped = false; // 💥 레이아웃 스위칭 상태 스토리지
window.gcsHudPositionMemory = { left: "auto", top: "auto", right: "20px", bottom: "20px" }; // 💥 드래그 좌표 기억 장치

window.toggleGcsCameraViewMode = function () {
    window.gcsCameraTrackingModeActive = !window.gcsCameraTrackingModeActive;
    var btn = document.getElementById("btn_hud_view_swap");
    if (btn) {
        btn.innerText = window.gcsCameraTrackingModeActive ? "🔄 점검 뷰 모드" : "🔄 광역 탑뷰 모드";
        btn.style.background = window.gcsCameraTrackingModeActive ? "#e67e22" : "#27ae60";
    }
};

/**
 * 1. 📋 HUD 컨테이너 마우스 드래그 이동 및 실시간 좌표 기억 모듈
 */
window.initGcsHudDraggable = function () {
    var hudContainer = document.getElementById("gcs_internal_hud_container") ||
        document.querySelector('.gcs-hud-panel') ||
        document.getElementById("hud");

    if (!hudContainer) return;

    var dragHandle = hudContainer.querySelector('#gcs_hud_header') || hudContainer;
    dragHandle.style.cursor = "move";

    var isDragging = false;
    var offsetPosition = { x: 0, y: 0 };

    dragHandle.addEventListener("mousedown", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
        // 화면 스위칭(전체화면) 상태일 때는 드래그를 잠금 차단합니다.
        if (window.isGcsLayoutSwapped) return;

        isDragging = true;
        offsetPosition.x = e.clientX - hudContainer.offsetLeft;
        offsetPosition.y = e.clientY - hudContainer.offsetTop;
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (e) {
        if (!isDragging || window.isGcsLayoutSwapped) return;

        var nextX = e.clientX - offsetPosition.x;
        var nextY = e.clientY - offsetPosition.y;

        if (nextX < 0) nextX = 0;
        if (nextY < 0) nextY = 0;
        if (nextX > window.innerWidth - hudContainer.offsetWidth) nextX = window.innerWidth - hudContainer.offsetWidth;
        if (nextY > window.innerHeight - hudContainer.offsetHeight) nextY = window.innerHeight - hudContainer.offsetHeight;

        hudContainer.style.left = nextX + "px";
        hudContainer.style.top = nextY + "px";
        hudContainer.style.right = "auto";
        hudContainer.style.bottom = "auto";

        // 💥 사용자가 마우스 드롭으로 이동시킨 현재 자리를 메모리에 실시간 래칭(기억)합니다.
        window.gcsHudPositionMemory.left = nextX + "px";
        window.gcsHudPositionMemory.top = nextY + "px";
        window.gcsHudPositionMemory.right = "auto";
        window.gcsHudPositionMemory.bottom = "auto";
    });

    document.addEventListener("mouseup", function () {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = "auto";
        }
    });
};

/**
 * 🔄 [레이아웃 제어 연동 보완] 스위칭 및 강제 리사이즈 시 캔버스 세로 높이 차단막 제거
 */
var originalSwitchGcsMainWindowAndHud = window.switchGcsMainWindowAndHud;
window.switchGcsMainWindowAndHud = function () {
    if (typeof originalSwitchGcsMainWindowAndHud === "function") {
        originalSwitchGcsMainWindowAndHud();
    }

    // 💥 원복 상태(작은 서브 창 구조)일 때도 캔버스가 작게 쪼그라들지 않도록 세로 높이를 시원하게 강제 조정!
    var canvas = document.getElementById("gcs_hud_minimap_canvas");
    if (canvas) {
        if (!window.isGcsLayoutSwapped) {
            canvas.style.height = "220px"; // 💥 150px에서 220px로 크기를 키워 시각적 답답함 해소!
            canvas.height = 220;
        }
        if (window.GcsThreeRadar && typeof window.GcsThreeRadar.resize === "function") {
            window.GcsThreeRadar.resize();
            // 최종 고정 상태 강제 리렌더 호출
            window.GcsThreeRadar.update([], 0, 0, 0);
        }
    }
};
/**
• 🛑 [시뮬레이션 중지 인터록 패치] 종료 후에도 계기판 텍스트 정보 마킹 고정 유지
*/
var originalStopGcsDroneSimulation = window.stopGcsDroneSimulation;
window.stopGcsDroneSimulation = function () {
    if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
        var mainViewer = ws3d.viewer;
        mainViewer.trackedEntity = undefined;
        mainViewer.clock.shouldAnimate = false; if (window.gcsMultiCamRenderListener) {
            mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener);
            window.gcsMultiCamRenderListener = null;
        }
        if (window.gcsSimulatedDroneEntity) {
            if (window.gcsSimulatedDroneEntity.show === false) window.gcsSimulatedDroneEntity.show = true;
            mainViewer.entities.remove(window.gcsSimulatedDroneEntity);
            window.gcsSimulatedDroneEntity = null;
        }
        mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);// 💥 [최종 상태 고정]: 세슘 이벤트 리스너는 죽이되, 삼차원 레이더 창에 마지막 백업본을 밀어 넣어 화면을 정지 유지시킵니다.
        if (window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
            window.GcsThreeRadar.update([], 0, 0, 0);
        }
    }
};




/**
 * 3. 🛑 [종료 원복 결착] HUD 우측 상단 X 닫기 버튼 전용 원격 차단막 디스패처
 */
window.closeGcsHudPanelWithLayoutRestore = function () {
    var hudContainer = document.getElementById("gcs_internal_hud_container") ||
        document.querySelector('.gcs-hud-panel') ||
        document.getElementById("hud");

    if (!hudContainer) return;

    // 💥 [버그 완치 핵심부 2] HUD 창 종료 시 화면이 뒤바뀐(Swapped) 상태라면 3D 지도를 큰 화면으로 먼저 안전 원복!
    if (window.isGcsLayoutSwapped) {
        window.switchGcsMainWindowAndHud();
    }

    // 화면 원복이 완료된 후 HUD 컨테이너 시각막을 안전하게 클로징 차단
    hudContainer.style.display = "none";

    // 좌측 메뉴의 HUD 체크박스 물리 상태도 해제(False) 동기화 결착
    var chk = document.getElementById("gcs_hud_use_toggle") || document.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = false;
};

// =========================================================================
// 🛸 [3D 완공] Three.js 입체 관제 레이더 엔진 (Z축 연동, 3D 격자, 마우스 카메라 제어)
// =========================================================================

window.GcsThreeRadar = window.GcsThreeRadar || {
    scene: null,
    camera: null,
    renderer: null,
    flightLine: null,
    droneMarker: null,
    droneVerticalLine: null, // 💥 상승/하강 수직 가이드선
    gridHelper: null,        // 💥 3D 공간 입체 격자
    isInitialized: false,
    useFallback2D: false,

    // 마우스 3D 카메라 제어용 상태 스토리지 (내장 OrbitControls 최소화 구현)
    cameraState: {
        isTargeting: false,
        theta: Math.PI / 4, // 수평 회전각
        phi: Math.PI / 3,   // 수직 조감각
        radius: 70,         // 카메라 거리 (확대/축소 축)
        lastMouseX: 0,
        lastMouseY: 0
    },

    // 💥 [3D 입체 공간 초기화]
    init: function () {
        if (this.isInitialized) return;

        var canvas = document.getElementById("gcs_hud_minimap_canvas");
        if (!canvas) return;

        var width = canvas.clientWidth || 360;
        var height = canvas.clientHeight || 150;

        if (typeof THREE !== "undefined" && typeof THREE.Scene === "function") {
            try {
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x0b0f19);

                // 💥 1. 원근감 카메라(PerspectiveCamera)로 전환하여 입체감 극대화
                this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
                this.updateCameraPosition();

                this.renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance",
                    failIfMajorPerformanceCaveat: false
                });
                this.renderer.setSize(width, height, false);

                // 💥 2. 3D 공간 입체 격자 그리드(GridHelper) 배정 (크기 100, 20칸 분할)
                // 하단 지면에 회색 격자를 깔아 공간 고도감을 인지하기 쉽게 만듭니다.
                this.gridHelper = new THREE.GridHelper(100, 20, 0x00ffcc, 0x233142);
                this.gridHelper.position.y = -20; // 지면 고도 기준점 하강 배치
                this.scene.add(this.gridHelper);

                // 💥 3. 입체 3D 비행 경로 순항선 설정
                var lineMaterial = new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 3 });
                var lineGeometry = new THREE.BufferGeometry();
                this.flightLine = new THREE.Line(lineGeometry, lineMaterial);
                this.scene.add(this.flightLine);

                // 💥 4. 상승/하강을 시각화할 수직 가이드 실선 객체 매립
                var vLineMat = new THREE.LineDashedMaterial({ color: 0xff007f, dashSize: 1, gapSize: 1 });
                var vLineGeo = new THREE.BufferGeometry();
                this.droneVerticalLine = new THREE.Line(vLineGeo, vLineMat);
                this.scene.add(this.droneVerticalLine);

                // 💥 5. 드론 위치 표시용 핫핑크 3D 구체(Sphere) 정점 마커 배치
                var sphereGeo = new THREE.SphereGeometry(1.5, 16, 16);
                var sphereMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
                this.droneMarker = new THREE.Mesh(sphereGeo, sphereMat);
                this.scene.add(this.droneMarker);

                // 💥 6. 마우스 드래그 3D 회전 및 휠 확대/축소 이벤트 인터록 직접 결착
                this.bindCameraInteractionEvents(canvas);

                this.useFallback2D = false;
                console.log("%c🛸 [Three.js 레이더] 3D 입체 공간 스페이스 관제 엔진 전격 기동!", "color: #00ffcc; font-weight: bold;");
            } catch (err) {
                console.warn("📡 [GCS 안전 가드] WebGL 제한 상태 확인 -> 2D 엔진 우회", err);
                this.useFallback2D = true;
            }
        } else {
            this.useFallback2D = true;
        }

        this.isInitialized = true;
    },

    // 💥 [카메라 좌표 연산 업데이트]
    updateCameraPosition: function () {
        if (!this.camera) return;
        var s = this.cameraState;

        // 구면 좌표계(Spherical Coordinates) 수학 연산으로 카메라 위치 결정
        var x = s.radius * Math.sin(s.phi) * Math.sin(s.theta);
        var y = s.radius * Math.cos(s.phi) + s.radius * 0.2; // 약간 위쪽 시점 보정
        var z = s.radius * Math.sin(s.phi) * Math.cos(s.theta);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0); // 3D 공간 중앙 원점 응시
    },

    // 💥 [마우스 드래그 & 휠 줌 인터랙션 이벤트 핸들러]
    bindCameraInteractionEvents: function (canvas) {
        var self = this;
        var s = this.cameraState;

        // 마우스 클릭 (회전 시작)
        canvas.addEventListener('mousedown', function (e) {
            s.isTargeting = true;
            s.lastMouseX = e.clientX;
            s.lastMouseY = e.clientY;
        });

        // 마우스 드래그 회전 연동
        window.addEventListener('mousemove', function (e) {
            if (!s.isTargeting) return;

            var deltaX = e.clientX - s.lastMouseX;
            var deltaY = e.clientY - s.lastMouseY;

            s.theta -= deltaX * 0.007; // 수평 회전 감도 조절
            s.phi -= deltaY * 0.007;   // 수직 조감 회전 감도 조절

            // 임계 각도 제한 가드 (화면 뒤집힘 방지)
            if (s.phi < 0.1) s.phi = 0.1;
            if (s.phi > Math.PI / 2 + 0.2) s.phi = Math.PI / 2 + 0.2;

            s.lastMouseX = e.clientX;
            s.lastMouseY = e.clientY;

            self.updateCameraPosition();
        });

        // 마우스 클릭 해제
        window.addEventListener('mouseup', function () {
            s.isTargeting = false;
        });

        // 💥 마우스 휠 스크롤 실시간 확대(Zoom In) / 축소(Zoom Out) 연동
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            s.radius += e.deltaY * 0.05; // 줌 감도 조절

            // 거리 범위 가드 제한
            if (s.radius < 20) s.radius = 20;
            if (s.radius > 200) s.radius = 200;

            self.updateCameraPosition();
        }, { passive: false });
    },

    // 💥 [실시간 3D 데이터 파이프라인] Z축 고도, 상승/하강 수직선 정밀 렌더링
    update: function (waypointList, liveLon, liveLat, liveAlt) {
        var canvas = document.getElementById("gcs_hud_minimap_canvas");
        if (!this.isInitialized || !canvas || !waypointList || waypointList.length === 0) return;

        // 2D 우회 모드일 때는 기존 안전 레이어로 가볍게 회피
        if (this.useFallback2D) {
            this.renderFallback2D(canvas, waypointList, liveLon, liveLat, liveAlt);
            return;
        }

        // 글로벌 위경도 바운딩 박스 변환 연산
        var minLon = 180, maxLon = -180, minLat = 90, maxLat = -180;
        for (var m = 0; m < waypointList.length; m++) {
            var p = waypointList[m];
            if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
            if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
        }
        var lonSpan = (maxLon - minLon) <= 0 ? 0.0001 : (maxLon - minLon);
        var latSpan = (maxLat - minLat) <= 0 ? 0.0001 : (maxLat - minLat);

        // 3D 스페이스 스케일링 오프셋 연산 매트릭스 (X, Z 평면 배치, Y를 고도 고도 고유축으로 설정)
        var to3DX = function (l) { return ((l - minLon) / lonSpan) * 80 - 40; };
        var to3DZ = function (t) { return ((t - minLat) / latSpan) * 40 - 20; };
        // 💥 고도(m) 비례 실시간 Y축 입체 변환 공식 결착 (지면 격자선 위로 정교하게 띄움)
        var to3DY = function (a) { return -20 + (a / 500) * 40; };

        // 💥 1. 이륙 전 구간부터 각 노드별 고도(Z축 -> Y축)를 반영한 입체 3D 비행 경로선 매핑
        var linePoints = [];
        waypointList.forEach(function (wp, idx) {
            var wx = to3DX(wp.lon);
            var wz = to3DZ(wp.lat);
            var wy = to3DY(wp.alt);

            // 첫 출발지(Home)의 경우 지면(0m)에서부터 이륙 경로를 시각화하기 위해 가이드 인덱싱 추가
            if (idx === 0) {
                linePoints.push(wx, -20, wz); // 지면 정점
            }
            linePoints.push(wx, wy, wz);      // 상공 고도 정점
        });
        this.flightLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
        this.flightLine.geometry.attributes.position.needsUpdate = true;

        // 💥 2. 실시간 드론 정점 구체 위치 연동 (이륙·상승·하강 고도 변화를 Y축에 실시간 다이렉트 바인딩)
        var curX = to3DX(liveLon);
        var curY = to3DY(liveAlt);
        var curZ = to3DZ(liveLat);
        this.droneMarker.position.set(curX, curY, curZ);

        // 💥 3. 실시간 상승/하강 수직 투영 가이드선 렌더링 (드론 정점 기점에서 지면 격자판까지 실선 수직 하강 매립)
        var vLinePoints = [
            curX, curY, curZ, // 현재 드론 실시간 3D 위치 정점
            curX, -20, curZ   // 드론 바로 아래 지면 격자판 투영 정점
        ];
        this.droneVerticalLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vLinePoints, 3));
        this.droneVerticalLine.geometry.attributes.position.needsUpdate = true;

        // 3D 렌더러 최종 사출 출력
        this.renderer.render(this.scene, this.camera);
    },

    // 💥 WebGL 예외 차단용 2D 폴백 레이러 소스코드 안전 보관 매립
    renderFallback2D: function (canvas, waypointList, liveLon, liveLat, liveAlt) {
        var ctx = canvas.getContext("2d"); if (!ctx) return;
        var width = canvas.width, height = canvas.height;
        ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#0b0f19"; ctx.fillRect(0, 0, width, height);
        ctx.font = "11px sans-serif"; ctx.fillStyle = "#ef5350"; ctx.fillText("⚠️ 3D 가속 제한 모드 구동 중", 15, 25);
    },

    resize: function () {
        var canvas = document.getElementById("gcs_hud_minimap_canvas");
        if (!this.isInitialized || this.useFallback2D || !this.renderer || !canvas) return;
        var width = canvas.clientWidth;
        var height = canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }
};
// =========================================================================


/**
 * 4. 🛸 자율주행 시뮬레이션 타임라인 엔진 기동 파이프라인
 */
window.startGcsDroneSimulation = function () {
    // 💥 [교정] 211번 라인 부근: 객체 유무를 더 튼튼하게 검사한 뒤 초기화 기동
    if (window.GcsThreeRadar && typeof window.GcsThreeRadar.init === "function") {
        window.GcsThreeRadar.init();
    }

    if (typeof window.GcsThreeRadar.init === "function") window.GcsThreeRadar.init();

    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) return;
    var mainViewer = ws3d.viewer;

    var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
    if (!list || list.length < 2) { alert("⚠️ 출발지(Home)와 최종 목적지(Destination)를 구성해 주세요."); return; }

    window.gcsCameraTrackingModeActive = true;
    var swapBtn = document.getElementById("btn_hud_view_swap");
    if (swapBtn) { swapBtn.innerText = "🔄 점검 뷰 모드"; swapBtn.style.background = "#e67e22"; }

    if (typeof window.stopGcsDroneSimulation === "function") {
        mainViewer.trackedEntity = undefined;
        mainViewer.clock.shouldAnimate = false;
        if (window.gcsMultiCamRenderListener) { mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener); window.gcsMultiCamRenderListener = null; }
        if (window.gcsSimulatedDroneEntity) { mainViewer.entities.remove(window.gcsSimulatedDroneEntity); window.gcsSimulatedDroneEntity = null; }
    }

    var propertyPosition = new Cesium.SampledPositionProperty();
    var propertyOrientation = new Cesium.SampledProperty(Cesium.Quaternion);
    propertyPosition.setInterpolationOptions({ interpolationDegree: 1, interpolationAlgorithm: Cesium.LinearApproximation });

    var startTime = mainViewer.clock.currentTime.clone();
    var homeNode = list[0];
    var destNode = list[list.length - 1];
    var flightPathPoints = list.slice(1);

    var takeoffAlt = parseFloat(homeNode.alt) || 150.0;
    var destAlt = parseFloat(destNode.alt) || 150.0;

    var firstTargetNode = (flightPathPoints.length > 0) ? flightPathPoints[0] : destNode;
    var homeCartesian = Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, takeoffAlt);
    var firstTargetCartesian = Cesium.Cartesian3.fromDegrees(firstTargetNode.lon, firstTargetNode.lat, parseFloat(firstTargetNode.alt) || 150.0);

    var targetHeadingRadian = Math.atan2(Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(homeCartesian), new Cesium.Matrix4()), firstTargetCartesian, new Cesium.Cartesian3()).x, Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(homeCartesian), new Cesium.Matrix4()), firstTargetCartesian, new Cesium.Cartesian3()).y);
    if (isNaN(targetHeadingRadian) || !isFinite(targetHeadingRadian)) targetHeadingRadian = 0.0;

    var qInitialNorth = Cesium.Transforms.headingPitchRollQuaternion(Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, 0.0), new Cesium.HeadingPitchRoll(0.0, 0.0, 0.0));

    var qTakeoffUp = Cesium.Transforms.headingPitchRollQuaternion(homeCartesian, new Cesium.HeadingPitchRoll(0.0, 0.0, 0.0));
    var qTargetTurn = Cesium.Transforms.headingPitchRollQuaternion(homeCartesian, new Cesium.HeadingPitchRoll(targetHeadingRadian, 0.0, 0.0));
    var t_wait = window.GcsApp.SIM_CONFIG.TIME_WAIT;
    var t_climb = window.GcsApp.SIM_CONFIG.TIME_CLIMB;
    var t_hover = window.GcsApp.SIM_CONFIG.TIME_HOVER_CHECK;
    var t0 = 0, t1 = t_wait, t2 = t_wait + t_climb, t3 = t_wait + t_climb + t_hover, timeSum = t3;
    propertyPosition.addSample(Cesium.JulianDate.addSeconds(startTime, t0, new Cesium.JulianDate()), Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, 0.0));
    propertyOrientation.addSample(Cesium.JulianDate.addSeconds(startTime, t0, new Cesium.JulianDate()), qInitialNorth);
    propertyPosition.addSample(Cesium.JulianDate.addSeconds(startTime, t1, new Cesium.JulianDate()), Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, 0.0));
    propertyOrientation.addSample(Cesium.JulianDate.addSeconds(startTime, t1, new Cesium.JulianDate()), qInitialNorth);
    propertyPosition.addSample(Cesium.JulianDate.addSeconds(startTime, t2, new Cesium.JulianDate()), homeCartesian);
    propertyOrientation.addSample(Cesium.JulianDate.addSeconds(startTime, t2, new Cesium.JulianDate()), qTakeoffUp);
    propertyPosition.addSample(Cesium.JulianDate.addSeconds(startTime, t3, new Cesium.JulianDate()), homeCartesian);
    propertyOrientation.addSample(Cesium.JulianDate.addSeconds(startTime, t3, new Cesium.JulianDate()), qTargetTurn);
    var currentHeading = targetHeadingRadian;
    window.gcsHoverScheduleTimestamps = [{ name: "Home_Hover", start: t2, end: t3 }];
    var qFinalFixed = qTargetTurn;
    for (var j = 0; j < flightPathPoints.length; j++) {
        var node = flightPathPoints[j]; if (!node) continue;
        var cruiseAlt = parseFloat(node.alt) || 150.0;
        var isDest = (j === flightPathPoints.length - 1);
        timeSum += window.GcsApp.SIM_CONFIG.TIME_CRUISE_STEP;
        var nodeTimeArrival = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
        var nodeCartesian = Cesium.Cartesian3.fromDegrees(node.lon, node.lat, cruiseAlt);
        propertyPosition.addSample(nodeTimeArrival, nodeCartesian);
        var qFlight = Cesium.Transforms.headingPitchRollQuaternion(nodeCartesian, new Cesium.HeadingPitchRoll(currentHeading, 0.0, 0.0));
        propertyOrientation.addSample(nodeTimeArrival, qFlight);
        if (!isDest) {
            var startHoverTime = timeSum; timeSum += window.GcsApp.SIM_CONFIG.TIME_NODE_HOVER;
            var nodeTimeHoverEnd = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
            propertyPosition.addSample(nodeTimeHoverEnd, nodeCartesian);
            var nextNode = flightPathPoints[j + 1] || destNode;
            var nextCartesian = Cesium.Cartesian3.fromDegrees(nextNode.lon, nextNode.lat, parseFloat(nextNode.alt) || 150.0);
            var calHeading = Math.atan2(Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(nodeCartesian), new Cesium.Matrix4()), nextCartesian, new Cesium.Cartesian3()).x, Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(nodeCartesian), new Cesium.Matrix4()), nextCartesian, new Cesium.Cartesian3()).y);
            if (!isNaN(calHeading) && isFinite(calHeading)) currentHeading = calHeading;
            var qNextTurn = Cesium.Transforms.headingPitchRollQuaternion(nodeCartesian, new Cesium.HeadingPitchRoll(currentHeading, 0.0, 0.0));
            propertyOrientation.addSample(nodeTimeHoverEnd, qNextTurn);
            window.gcsHoverScheduleTimestamps.push({ name: node.id, start: startHoverTime, end: timeSum });
        } else { qFinalFixed = qFlight; }
    }
    var nodeTimeLanding = Cesium.JulianDate.addSeconds(startTime, timeSum, new Cesium.JulianDate());
    propertyPosition.addSample(nodeTimeLanding, Cesium.Cartesian3.fromDegrees(destNode.lon, destNode.lat, destAlt));
    propertyOrientation.addSample(nodeTimeLanding, qFinalFixed);
    window.gcsSimulatedDroneEntity = mainViewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: nodeTimeLanding })]),
        position: propertyPosition, orientation: propertyOrientation,
        model: { uri: "data/drone.glb", scale: 0.15, minimumPixelSize: 35, maximumScale: 50, runAnimations: true, clampAnimations: false, shadows: Cesium.ShadowMode.ENABLED },
        label: { text: "🛸 이륙 준비", font: 'bold 14px "Malgun Gothic", sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE, fillColor: Cesium.Color.SPRINGGREEN, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, verticalOrigin: Cesium.VerticalOrigin.CENTER, horizontalOrigin: Cesium.HorizontalOrigin.LEFT, pixelOffset: new Cesium.Cartesian2(35, 0) }
    });
    mainViewer.clock.startTime = startTime.clone(); mainViewer.clock.stopTime = nodeTimeLanding.clone(); mainViewer.clock.currentTime = startTime.clone();
    mainViewer.clock.clockRange = Cesium.ClockRange.CLAMPED; mainViewer.clock.multiplier = 1.0; mainViewer.scene.requestRenderMode = false;
    if (mainViewer.clockViewModel) mainViewer.clockViewModel.shouldAnimate = true; mainViewer.clock.shouldAnimate = true;
    mainViewer.trackedEntity = undefined;
    mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    mainViewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(homeNode.lon, homeNode.lat, takeoffAlt + 120.0), orientation: { heading: targetHeadingRadian, pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 } });
    var canvas = document.getElementById("gcs_hud_minimap_canvas"); var ctx = canvas ? canvas.getContext("2d") : null;
    var cameraSwitchedToHoverPOV = false;

    window.gcsMultiCamRenderListener = function () {
        if (!window.gcsSimulatedDroneEntity) return;
        var currentTime = mainViewer.clock.currentTime;
        var elapsed = Cesium.JulianDate.secondsDifference(currentTime, startTime);
        var stage = "takeoff", statusStr = "대기중", labelColor = Cesium.Color.LIGHTGRAY;
        var elStatus = document.getElementById("hud_status_text"), elStage = document.getElementById("hud_metric_stage"), elAlt = document.getElementById("hud_metric_alt"), elHeading = document.getElementById("hud_metric_heading"), elCoords = document.getElementById("hud_metric_coords");
        var droneCartesian = window.gcsSimulatedDroneEntity.position.getValue(currentTime); if (!Cesium.defined(droneCartesian)) return;
        var droneCarto = Cesium.Cartographic.fromCartesian(droneCartesian); if (!Cesium.defined(droneCarto)) return;
        var lon = Cesium.Math.toDegrees(droneCarto.longitude), lat = Cesium.Math.toDegrees(droneCarto.latitude), alt = droneCarto.height;
        if (isNaN(lon) || isNaN(lat) || isNaN(alt) || lon === 0 || lat === 0) return;
        if (elapsed >= timeSum) {
            window.stopGcsDroneSimulation();
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(destNode.lon, destNode.lat, destAlt + 180.0), orientation: { heading: currentHeading, pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 } });
            return;
        }
        if (elapsed <= t_wait) {
            stage = "takeoff_ready"; statusStr = "지면 모터 시동 대기"; labelColor = Cesium.Color.LIGHTGRAY;
        } else if (elapsed > t_wait && elapsed <= t2) {
            stage = "takeoff_climb"; statusStr = "이륙 및 수직 상승 기동"; labelColor = Cesium.Color.ORANGE;
        } else if (elapsed > t2 && elapsed <= t3) {
            stage = "takeoff_hover"; statusStr = "이륙고도 안착 경로회전 정렬"; labelColor = Cesium.Color.YELLOW;
        } else {
            stage = "cruise"; statusStr = "임무 공역 자율 순항"; labelColor = Cesium.Color.CYAN;
            if (window.gcsHoverScheduleTimestamps) { for (var k = 0; k < window.gcsHoverScheduleTimestamps.length; k++) { var sch = window.gcsHoverScheduleTimestamps[k]; if (elapsed >= sch.start && elapsed <= sch.end) { statusStr = "지정 노드 호버링 관제"; labelColor = Cesium.Color.YELLOW; break; } } }
        }
        if (window.gcsSimulatedDroneEntity.label) { window.gcsSimulatedDroneEntity.label.text = "🛸 " + statusStr + " (" + Math.round(alt) + "m)"; window.gcsSimulatedDroneEntity.label.fillColor = labelColor; }

        // =========================================================================
        // ✈️ [최종 마스터 완공형] 1인칭 전방 FPV POV (hudContainer 변수 오류 완벽 해결)
        // =========================================================================
        // 💥 매 프레임 안전한 접근을 위해 함수 내부 컨텍스트에서 DOM 엘리먼트 정밀 트레킹 재정의
        var currentHudContainer = document.getElementById("gcs_internal_hud_container") ||
            document.querySelector('.gcs-hud-panel') ||
            document.getElementById("hud");

        if (window.gcsCameraTrackingModeActive) {
            if (stage === "takeoff_ready" || stage === "takeoff_climb") {
                if (window.gcsSimulatedDroneEntity) {
                    window.gcsSimulatedDroneEntity.show = true;
                }
                mainViewer.trackedEntity = undefined;
                cameraSwitchedToHoverPOV = false;
            } else {
                if (window.gcsSimulatedDroneEntity) {
                    window.gcsSimulatedDroneEntity.show = false; // 드론 숨김 유지
                }

                mainViewer.trackedEntity = undefined;
                mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); // 엔진 height 오류 차단

                var droneQuat = window.gcsSimulatedDroneEntity.orientation.getValue(currentTime);
                var liveHeadingRadian = currentHeading; // 폴백용 기본값 배정

                if (Cesium.defined(droneQuat)) {
                    var enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(droneCartesian);
                    var invEnuTransform = Cesium.Matrix4.inverse(enuTransform, new Cesium.Matrix4());
                    var rotationMatrix3 = Cesium.Matrix3.fromQuaternion(droneQuat);
                    var rotationMatrix4 = Cesium.Matrix4.fromRotation(rotationMatrix3, new Cesium.Matrix4());
                    var localTransform = Cesium.Matrix4.multiply(invEnuTransform, rotationMatrix4, new Cesium.Matrix4());
                    var localMatrix3 = Cesium.Matrix4.getRotation(localTransform, new Cesium.Matrix3());
                    var localQuaternion = Cesium.Quaternion.fromRotationMatrix(localMatrix3);
                    var localHpr = Cesium.HeadingPitchRoll.fromQuaternion(localQuaternion);

                    // 로컬 진행 방향각 매핑
                    liveHeadingRadian = localHpr.heading + Cesium.Math.toRadians(90.0);
                }

                // 벡터 반전 행렬 특성을 고려하여 Pitch를 '+45.0도' 양수로 전환 배정
                var targetHpr = new Cesium.HeadingPitchRoll(liveHeadingRadian, Cesium.Math.toRadians(45.0), 0.0);

                var hprMatrix3 = Cesium.Matrix3.fromHeadingPitchRoll(targetHpr);
                var globalEnuRotation = Cesium.Transforms.eastNorthUpToFixedFrame(droneCartesian);
                var globalRotationMatrix3 = Cesium.Matrix4.getRotation(globalEnuRotation, new Cesium.Matrix3());
                var finalRotationMatrix3 = Cesium.Matrix3.multiply(globalRotationMatrix3, hprMatrix3, new Cesium.Matrix3());

                var rawDirection = Cesium.Matrix3.getColumn(finalRotationMatrix3, 0, new Cesium.Cartesian3());
                var camUp = Cesium.Matrix3.getColumn(finalRotationMatrix3, 2, new Cesium.Cartesian3());

                var camDirection = new Cesium.Cartesian3();
                Cesium.Cartesian3.negate(rawDirection, camDirection);

                mainViewer.camera.position = droneCartesian;
                mainViewer.camera.direction = camDirection; // 정면 진행 방향 고정
                mainViewer.camera.up = camUp;               // 상방 축 유지
                cameraSwitchedToHoverPOV = true;
            }
        } else {
            if (window.gcsSimulatedDroneEntity) {
                window.gcsSimulatedDroneEntity.show = true;
            }
            mainViewer.trackedEntity = undefined;
            mainViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            mainViewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt + 180.0),
                orientation: { heading: currentHeading, pitch: Cesium.Math.toRadians(-90.0), roll: 0.0 }
            });
            cameraSwitchedToHoverPOV = false;
        }

        // 💥 [Three.js 최적화 가드] 불필요한 ctx(2D) 검사를 빼고, 비행 노드 데이터가 쌓였을 때만 3D 레이더 기동
        if (canvas && list && list.length > 0) {
            window.GcsThreeRadar.update(list, lon, lat, alt);
        }

        // 💥 [버그 완치 핵심부] 정밀 래칭된 변수 명세를 통하여 블로킹 없는 HUD 실시간 데이터 동기화 기동
        if (currentHudContainer && currentHudContainer.style.display === "block") {
            if (elStatus) elStatus.innerText = statusStr;
            if (elStage) elStage.innerText = (stage.indexOf("takeoff_ready") !== -1 || stage.indexOf("takeoff_climb") !== -1 ? "🛫 이륙 및 고도 상승 고정" : "🛸 임무 공역 자율 순항");
            if (elAlt) elAlt.innerText = Math.round(alt);
            if (elHeading) elHeading.innerText = (liveHeadingRadian * (180 / Math.PI)).toFixed(1);
            if (elCoords) elCoords.innerText = "X: " + lon.toFixed(5) + ", Y: " + lat.toFixed(5);
        }
    };
    mainViewer.scene.postRender.addEventListener(window.gcsMultiCamRenderListener);
};

// =========================================================================
// 🛸 [완치 패치] FPV 시선각 100% 보존형 후방 슬라이딩 백업 및 드론 수동 조정 엔진
// =========================================================================

window.isGcsSimulationPaused = false;
window.isGcsDroneDraggingMode = false;
window.gcsDroneDragHandlerInstance = null; 

window.toggleGcsDroneSimulationStatus = function () {
    if (typeof ws3d === "undefined" || !ws3d || !ws3d.viewer) {
        console.warn("⚠️ [GCS 안전 가드] Cesium ws3d 지도가 초기화되지 않았습니다.");
        return;
    }
    var mainViewer = ws3d.viewer;
    var scene = mainViewer.scene;
    
    var toggleBtn = document.getElementById("btn_emergency_toggle");
    if (!toggleBtn) return;

    if (!window.gcsMultiCamRenderListener && !window.isGcsSimulationPaused) {
        alert("⚠️ 현재 구동 중인 자율주행 시뮬레이션이 없습니다.");
        return;
    }

    var drone = window.gcsSimulatedDroneEntity;

    if (!window.isGcsSimulationPaused) {
        // =================================================================
        // 🛑 [일시 중지 모드] -> 보던 화면 그대로 카메라가 부드럽게 뒤로 빠집니다.
        // =================================================================
        window.isGcsSimulationPaused = true;
        mainViewer.clock.shouldAnimate = false; // 타임라인 정지
        
        // 💥 [핵심 가드] 1인칭 FPV 카메라 강제 결착 리스너를 먼저 안전하게 해제합니다.
        if (window.gcsMultiCamRenderListener) {
            mainViewer.scene.postRender.removeEventListener(window.gcsMultiCamRenderListener);
        }

        // 💥 [카메라 뷰포트 완전 유지 백업 연산]
        // 1인칭 시점에서 보고 있던 카메라의 실시간 '정면 진행 방향 벡터'와 '상방 벡터'를 가로채서 보존합니다.
        var currentCamPosition = Cesium.Cartesian3.clone(mainViewer.camera.position);
        var currentCamDirection = Cesium.Cartesian3.clone(mainViewer.camera.direction);
        var currentCamUp = Cesium.Cartesian3.clone(mainViewer.camera.up);

        // 정면 진행 방향의 반대 벡터(후방 벡터)를 계산합니다.
        var backwardVector = new Cesium.Cartesian3();
        Cesium.Cartesian3.negate(currentCamDirection, backwardVector);

        // 후방으로 약 45미터 밀어낼 거리 벡터 산출
        var moveDistance = 45.0; 
        var scaledBackward = new Cesium.Cartesian3();
        Cesium.Cartesian3.multiplyByScalar(backwardVector, moveDistance, scaledBackward);

        // 수직 상공으로 약 15미터 띄울 높이 벡터 산출
        var climbDistance = 15.0;
        var scaledUp = new Cesium.Cartesian3();
        Cesium.Cartesian3.multiplyByScalar(currentCamUp, climbDistance, scaledUp);

        // 최종 카메라가 안착해야 할 3D 공간 좌표 타겟 매핑
        var targetCamPosition = new Cesium.Cartesian3();
        Cesium.Cartesian3.add(currentCamPosition, scaledBackward, targetCamPosition);
        Cesium.Cartesian3.add(targetCamPosition, scaledUp, targetCamPosition);

        // 지도가 꺾이거나 팅기지 않도록 lookAtTransform을 절대 쓰지 않고, 
        // 1인칭 시선의 방향 벡터 밸런스를 그대로 유지하면서 flyTo 슬라이딩을 수행합니다.
        mainViewer.camera.flyTo({
            destination: targetCamPosition,
            orientation: {
                direction: currentCamDirection, // 드론 전방을 응시하던 시선 벡터 각도 100% 일치 고정
                up: currentCamUp                // 카메라 상방 축 일치 고정
            },
            duration: 0.6,
            complete: function() {
                // 카메라 슬라이딩 이동이 완공된 후 드론 객체에 관제 포커스를 매핑합니다.
                if (drone) mainViewer.selectedEntity = drone;
            }
        });

        // 투명하게 숨겨져 있던 드론 3D 모델을 화면 시야 앞에 사출
        if (drone) {
            drone.show = true; 
            if (drone.label) {
                drone.label.text = "🛸 수동 조작 대기 중";
                drone.label.fillColor = Cesium.Color.YELLOW;
            }
        }

        // 버튼 UI 토글 변환
        toggleBtn.innerHTML = "▶ 시뮬레이션 자율주행 재시작";
        toggleBtn.style.backgroundColor = "#2ecc71";
        toggleBtn.style.borderColor = "#27ae60";

        // =========================================================================
        // 💥 [완치 패치] Cesium.Color API 오류 원천 해결형 반응형 하이라이트 엔진
        // =========================================================================
        if (!window.gcsDroneDragHandlerInstance) {
            window.gcsDroneDragHandlerInstance = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        }
        var dragHandler = window.gcsDroneDragHandlerInstance;

        var isCurrentlyHovered = false;

        // A. 마우스 왼쪽 다운 (광역 포획 및 지도 동결)
        dragHandler.setInputAction(function (clickEvent) {
            if (!drone) return;
            
            var pickedObject = scene.pick(clickEvent.position);
            
            if (!Cesium.defined(pickedObject)) {
                var pickList = scene.drillPick(clickEvent.position, 25);
                for (var p = 0; p < pickList.length; p++) {
                    if (pickList[p].id === drone || pickList[p].primitive === drone) {
                        pickedObject = pickList[p];
                        break;
                    }
                }
            }
            
            if (Cesium.defined(pickedObject) && (pickedObject.id === drone || pickedObject.primitive === drone)) {
                window.isGcsDroneDraggingMode = true;
                
                scene.screenSpaceCameraController.enableRotate = false;
                scene.screenSpaceCameraController.enableTranslate = false;
                scene.screenSpaceCameraController.enableInputs = false; 
                
                document.body.style.cursor = "move";
                
                // 클릭 순간 확실한 피드백을 위해 내장 RED 상수로 전환
                if (drone.point) {
                    drone.point.color = Cesium.Color.RED;
                    drone.point.outlineColor = Cesium.Color.WHITE;
                    drone.point.pixelSize = 24;
                }
                console.log("🛸 [GCS 포획] 드론 기체 포획 성공 - 수동 위치 오버라이드 가동");
            }
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

        // B. 마우스 무브 (실시간 에러 프리 호버 하이라이트 & 드래그 연산)
        dragHandler.setInputAction(function (moveEvent) {
            if (!drone) return;

            // -----------------------------------------------------------------
            // ① [실시간 호버 하이라이트 연산 가드 - 에러 수정본]
            // -----------------------------------------------------------------
            if (!window.isGcsDroneDraggingMode) {
                var hoverTarget = scene.pick(moveEvent.endPosition);
                
                if (!Cesium.defined(hoverTarget)) {
                    var hoverList = scene.drillPick(moveEvent.endPosition, 25);
                    for (var h = 0; h < hoverList.length; h++) {
                        if (hoverList[h].id === drone || hoverList[h].primitive === drone) {
                            hoverTarget = hoverList[h];
                            break;
                        }
                    }
                }

                if (Cesium.defined(hoverTarget) && (hoverTarget.id === drone || hoverTarget.primitive === drone)) {
                    if (!isCurrentlyHovered) {
                        isCurrentlyHovered = true;
                        document.body.style.cursor = "pointer";
                        
                        // 민트 아우라 관제 박스 활성화
                        mainViewer.selectedEntity = drone; 
                        
                        // 💥 [오류 수정 핵심] 에러를 내뿜던 fromCssString을 완전히 제거하고, 
                        // Cesium 내부 코어가 100% 무조건 지원하는 RGB 바이트 매핑 공식(fromBytes)을 사용하여
                        // 선명한 네온 민트 그린 색상(R:0, G:255, B:204)을 정밀 강제 주입합니다!
                        var neonMintColor = Cesium.Color.fromBytes(0, 255, 204, 255);
                        
                        if (drone.point) {
                            drone.point.color = neonMintColor;
                            drone.point.outlineColor = Cesium.Color.WHITE;
                            drone.point.pixelSize = 22; 
                        }
                        if (drone.label) {
                            drone.label.fillColor = neonMintColor;
                            drone.label.font = 'bold 16px "Malgun Gothic", sans-serif';
                        }
                    }
                } else {
                    if (isCurrentlyHovered) {
                        isCurrentlyHovered = false;
                        document.body.style.cursor = "default";
                        
                        mainViewer.selectedEntity = undefined; 
                        
                        if (drone.point) {
                            // 내장 안전 상수 매핑으로 에러 확률 0% 원복 보장
                            drone.point.color = Cesium.Color.HOTPINK || Cesium.Color.PINK; 
                            drone.point.outlineColor = Cesium.Color.BLACK;
                            drone.point.pixelSize = 16;
                        }
                        if (drone.label) {
                            drone.label.text = "🛸 수동 조작 대기 중";
                            drone.label.fillColor = Cesium.Color.YELLOW; 
                            drone.label.font = 'bold 14px "Malgun Gothic", sans-serif';
                        }
                    }
                }
            }

            // -----------------------------------------------------------------
            // ② [드론 실시간 마우스 고도 수평 평면 드래그 연산]
            // -----------------------------------------------------------------
            if (window.isGcsDroneDraggingMode) {
                var currentTime = mainViewer.clock.currentTime;
                var currentDroneHeight = 150.0; 
                
                var currentPosValue = drone.position.getValue(currentTime);
                if (Cesium.defined(currentPosValue)) {
                    currentDroneHeight = Cesium.Cartographic.fromCartesian(currentPosValue).height;
                }

                // 기체가 마우스 화살표 우측 상단 여백(우측 20px, 상단 10px)에 매달려 따라오게 오프셋 주입
                var offsetMousePosition = new Cesium.Cartesian2(
                    moveEvent.endPosition.x - 20, 
                    moveEvent.endPosition.y + 10  
                );

                var ray = mainViewer.camera.getPickRay(offsetMousePosition);
                var droneAltitudePlane = Cesium.Plane.fromPointNormal(
                    Cesium.Cartesian3.fromDegrees(126.9780, 37.5665, currentDroneHeight), 
                    mainViewer.scene.globe.ellipsoid.geodeticSurfaceNormal(Cesium.Cartesian3.fromDegrees(126.9780, 37.5665, 0))
                );

                var intersectionCartesian = Cesium.IntersectionTests.rayPlane(ray, droneAltitudePlane);

                if (Cesium.defined(intersectionCartesian)) {
                    var cartographic = Cesium.Cartographic.fromCartesian(intersectionCartesian);
                    var lon = Cesium.Math.toDegrees(cartographic.longitude);
                    var lat = Cesium.Math.toDegrees(cartographic.latitude);

                    if (!isNaN(lon) && !isNaN(lat) && lon !== 0 && lat !== 0) {
                        var finalDronePosition = Cesium.Cartesian3.fromDegrees(lon, lat, currentDroneHeight);
                        drone.position.addSample(currentTime, finalDronePosition);

                        if (window.GcsThreeRadar && typeof window.GcsThreeRadar.update === "function") {
                            var list = (window.GcsApp && window.GcsApp.state && window.GcsApp.state.waypointList) ? window.GcsApp.state.waypointList : window.waypointList;
                            window.GcsThreeRadar.update(list, lon, lat, currentDroneHeight);
                        }
                    }
                }
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // C. 마우스 왼쪽 업 (드론 배치 고정 및 하이라이트 클리어)
        dragHandler.setInputAction(function () {
            if (window.isGcsDroneDraggingMode) {
                window.isGcsDroneDraggingMode = false;
                isCurrentlyHovered = false;
                
                scene.screenSpaceCameraController.enableRotate = true;
                scene.screenSpaceCameraController.enableTranslate = true;
                scene.screenSpaceCameraController.enableInputs = true; 
                
                document.body.style.cursor = "default";
                mainViewer.selectedEntity = undefined; 
                
                if (drone && drone.point) {
                    drone.point.color = Cesium.Color.HOTPINK || Cesium.Color.PINK;
                    drone.point.pixelSize = 16;
                }
                if (drone && drone.label) {
                    drone.label.font = 'bold 14px "Malgun Gothic", sans-serif';
                    drone.label.fillColor = Cesium.Color.YELLOW;
                }
                console.log("🛸 [GCS 완치] 마우스 드롭 - 드론 좌표 고정 및 하이라이트 리셋 완료");
            }
        }, Cesium.ScreenSpaceEventType.LEFT_UP);


    } else {
        // =================================================================
        // ▶ [즉시 재시작 모드] -> 1인칭 FPV 관점으로 부드럽게 재진입 복귀합니다.
        // =================================================================
        window.isGcsSimulationPaused = false;
        window.isGcsDroneDraggingMode = false;

        if (window.gcsDroneDragHandlerInstance) {
            window.gcsDroneDragHandlerInstance.destroy();
            window.gcsDroneDragHandlerInstance = null;
        }
        mainViewer.scene.screenSpaceCameraController.enableInputs = true;
        mainViewer.selectedEntity = undefined;

        // FPV 1인칭 관제 카메라 렌더러 루프 재바인딩
        if (window.gcsMultiCamRenderListener) {
            mainViewer.scene.postRender.addEventListener(window.gcsMultiCamRenderListener);
        }

        mainViewer.clock.shouldAnimate = true; // 타임라인 기동

        toggleBtn.innerHTML = "🛑 시뮬레이션 긴급중지";
        toggleBtn.style.backgroundColor = "#c0392b";
        toggleBtn.style.borderColor = "#962d22";
    }
};


/**
 * 💥 2. [무한 루프 오류 원천 제거] 자율주행 시뮬레이션 기동 시작 래퍼 레이어 개조
 * 기존 코드의 무한 재귀 호출 구조를 완벽하게 제거하여 stack 오류를 원천 차단합니다.
 */
if (typeof window.startGcsDroneSimulation === "function" && !window.startGcsDroneSimulation.isPatched) {
    // 💥 최초 가동 시 원본 함수를 무한루프 안 걸리는 안전한 별도 고유 키에 래칭합니다.
    window.GcsApp_coreStartSimulationEngine = window.startGcsDroneSimulation;
    
    window.startGcsDroneSimulation = function () {
        // 플래그 및 마우스 리소스 클리어 가드
        window.isGcsSimulationPaused = false;
        window.isGcsDroneDraggingMode = false;
        if (window.gcsDroneDragHandlerInstance) {
            window.gcsDroneDragHandlerInstance.destroy();
            window.gcsDroneDragHandlerInstance = null;
        }
        
        // 긴급중지 버튼 테마 리셋 초기화
        var toggleBtn = document.getElementById("btn_emergency_toggle");
        if (toggleBtn) {
            toggleBtn.innerHTML = "🛑 시뮬레이션 긴급중지";
            toggleBtn.style.backgroundColor = "#c0392b";
            toggleBtn.style.borderColor = "#962d22";
        }
        
        // 무한루프가 걸리지 않는 안전 격리 노선으로 원본 시뮬레이션 코어 로직 엔진을 실행합니다.
        if (typeof window.GcsApp_coreStartSimulationEngine === "function") {
            window.GcsApp_coreStartSimulationEngine();
        }
    };
    // 중복 패치되어 꼬이는 현상을 원천 방어하는 보호 가드 플래그 주입
    window.startGcsDroneSimulation.isPatched = true;
}






// 5. 초기 기동 플러그인 로더 가동
setTimeout(function () {
    if (typeof window.initGcsHudDraggable === "function") window.initGcsHudDraggable();
}, 500);

// =========================================================================
// 🔄 [최종 마스터 완치] 3D 레이더 + 비행 정보(계기판) 일체형 상호 완전 스위칭 엔진
// =========================================================================
window.switchGcsMainWindowAndHud = function () {
    // 💥 1. 상호 교차 전환 대상 핵심 DOM 엘리먼트 추적
    var mapContainer = document.getElementById("vmap");
    var hudContainer = document.getElementById("gcs_internal_hud_container") ||
                        document.querySelector('.gcs-hud-panel') ||
                        document.getElementById("hud");
    var radarCanvas = document.getElementById("gcs_hud_minimap_canvas");

    // HUD 내부의 비행 정보 계기판 영역 컴포넌트 추적 (ID 또는 클래스 유연하게 대응)
    var flightInfoArea = document.getElementById("hud_metric_stage") ? 
                         document.getElementById("hud_metric_stage").closest('div') : 
                         hudContainer.querySelector('.hud-info-panel') || hudContainer.querySelector('.hud-metrics');

    if (!mapContainer || !hudContainer) {
        console.warn("⚠️ [스위칭 가드] 스위칭에 필요한 'vmap' 또는 'hud' 엘리먼트를 찾을 수 없습니다.");
        return;
    }

    // 상태 플래그 토글 반전
    window.isGcsLayoutSwapped = !window.isGcsLayoutSwapped;

    if (window.isGcsLayoutSwapped) {
        // =================================================================
        // A. [스위칭 활성화] HUD 창(레이더+비행 정보 전체)이 메인이 됨
        // =================================================================
        
        // ① HUD 전체 패널을 모니터 스크린 전체 화면(Full Screen) 레이아웃으로 변경
        hudContainer.style.position = "fixed";
        hudContainer.style.left = "0px";
        hudContainer.style.top = "0px";
        hudContainer.style.width = "100vw";
        hudContainer.style.height = "100vh";
        hudContainer.style.zIndex = "999";
        hudContainer.style.display = "flex";
        hudContainer.style.flexDirection = "column"; // 내부 컴포넌트를 위아래로 배치

        // ② 💥 [일체형 레이아웃 빌드] Three.js 레이더 영역과 비행 정보 계기판의 비율을 시원하게 분할 분배
        if (radarCanvas) {
            radarCanvas.style.width = "100%";
            // 아래 비행 정보 컴포넌트 공간을 확보하고 상단을 가득 채움
            radarCanvas.style.height = "calc(100vh - 160px)"; 
        }

        // ③ HUD 내부에 함께 래칭된 비행 정보 계기판 영역을 하단에 넓고 굵게 가로폭 100% 매핑
        if (flightInfoArea) {
            flightInfoArea.style.width = "100%";
            flightInfoArea.style.height = "120px";
            flightInfoArea.style.background = "rgba(11, 15, 25, 0.95)";
            flightInfoArea.style.borderTop = "2px solid #34495e";
            flightInfoArea.style.padding = "15px";
            flightInfoArea.style.boxSizing = "border-box";
            flightInfoArea.style.display = "grid";
            flightInfoArea.style.gridTemplateColumns = "repeat(4, 1fr)"; // 대화면 전환 시 4열로 보기 좋게 균등 정렬
            flightInfoArea.style.gap = "10px";
        }

        // ④ 브이월드 메인 지도 캔버스를 기존 HUD 위치인 우하단 미니 팝업 크기로 축소 삽입
        mapContainer.style.position = "fixed";
        mapContainer.style.width = "360px";
        mapContainer.style.height = "220px";
        mapContainer.style.right = "20px";
        mapContainer.style.bottom = "140px"; // 아래 비행 정보 바 위로 안 겹치게 살짝 띄움 배치
        mapContainer.style.left = "auto";
        mapContainer.style.top = "auto";
        mapContainer.style.zIndex = "1000"; // HUD창 위로 배치
        mapContainer.style.border = "2px solid #00ffcc";
        
        console.log("📡 [GCS 일체형 스위칭] HUD 전체 화면 및 비행 정보 데이터 동시 스케일링 활성화");
    } else {
        // =================================================================
        // B. [스위칭 해제 - 원복] 브이월드 지도가 전체화면이 되고 HUD가 우하단으로 복귀
        // =================================================================
        
        // ① 브이월드 지도 컨테이너 본래 전체화면 구조로 원복 리셋
        mapContainer.style.position = "absolute";
        mapContainer.style.width = "100%";
        mapContainer.style.height = "100%";
        mapContainer.style.left = "0px";
        mapContainer.style.top = "0px";
        mapContainer.style.right = "auto";
        mapContainer.style.bottom = "auto";
        mapContainer.style.zIndex = "1";
        mapContainer.style.border = "none";

        // ② HUD 미니 패널 원래 규격 스타일로 리셋
        hudContainer.style.position = "fixed";
        hudContainer.style.width = "360px";
        hudContainer.style.height = "auto";
        hudContainer.style.zIndex = "100";
        hudContainer.style.display = "block"; // 원래 블록 스타일 복원

        // 사용자가 이전에 드래그해서 드롭했던 커스텀 마우스 기억 좌표 복원
        if (window.gcsHudPositionMemory && window.gcsHudPositionMemory.left !== "auto") {
            hudContainer.style.left = window.gcsHudPositionMemory.left;
            hudContainer.style.top = window.gcsHudPositionMemory.top;
            hudContainer.style.right = "auto";
            hudContainer.style.bottom = "auto";
        } else {
            hudContainer.style.left = "auto";
            hudContainer.style.top = "auto";
            hudContainer.style.right = "20px";
            hudContainer.style.bottom = "20px";
        }

        // ③ 미니 패널 컴팩트 크기에 맞춰 Three.js 레이더 캔버스 크기 원복 (220px 보장)
        if (radarCanvas) {
            radarCanvas.style.width = "100%";
            radarCanvas.style.height = "220px";
            radarCanvas.height = 220;
        }

        // ④ 💥 비행 정보 영역 원래의 세로형 미니 리스트 UI 형태로 컴팩트 복원 원복
        if (flightInfoArea) {
            flightInfoArea.style.width = "100%";
            flightInfoArea.style.height = "auto";
            flightInfoArea.style.background = "transparent";
            flightInfoArea.style.borderTop = "none";
            flightInfoArea.style.padding = "6px";
            flightInfoArea.style.display = "block"; // 세로 한 줄 배치로 원복
        }

        console.log("📡 [GCS 일체형 스위칭] 메인 3D 지도 시스템 전체화면 및 HUD 컴팩트 제어반 원복 완료");
    }

    // =========================================================================
    // 💥 내부 WebGL 렌더러 픽셀 뷰포트 강제 리사이즈 스케일링 엔진 작동
    // =========================================================================
    setTimeout(function () {
        // 1. 축소/확대된 브이월드 Cesium 버퍼 크기 정밀 재계산
        if (typeof ws3d !== "undefined" && ws3d && ws3d.viewer) {
            ws3d.viewer.resize(); 
            ws3d.viewer.scene.requestRender(); 
        }

        // 2. Three.js 입체 관제 레이더 뷰포트 리사이즈 및 정지 화면 데이터 유지
        if (window.GcsThreeRadar && typeof window.GcsThreeRadar.resize === "function") {
            window.GcsThreeRadar.resize();
            window.GcsThreeRadar.update([], 0, 0, 0); 
        }
    }, 80);
};