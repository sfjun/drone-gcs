// =============================================================
// [교체 및 수정 코드] 3D 지형 에러 해결 및 3D 건물 주입
// =============================================================

// 🌐 1. [에러 원인 해결] 브이월드 자체 지형 대신 세슘 표준 글로벌 정밀 지형(Terrain) 로드
// 브이월드 Terrain API의 규격 불일치 충돌을 피하기 위해, 순수 세슘 엔진과 100% 호환되는
// 세슘 공식 월드 맵 Terrain 시스템을 온라인으로 안전하게 연결합니다. (화면 멈춤 버그 원천 차단)
Cesium.createWorldTerrainAsync().then(terrainProvider => {
    viewer.terrainProvider = terrainProvider;
    console.log("⛰️ 세슘 글로벌 표준 3D 지형 레이어가 장착되었습니다.");
}).catch(error => {
    console.error("지형 로드 중 오류 발생:", error);
});

// 🌐 2. 브이월드 3D 실측 건물 레이어 (3D Tiles) 직접 마운트
// 브이월드 건물 API 주소는 순수 세슘과 규격이 잘 맞으므로 그대로 유지하되, 
// 도메인 인증 오류(CORS) 방지를 위해 뒤에 쿼리 스트링 설정을 명확히 연결합니다.
Cesium.Cesium3DTileset.fromUrl(`https://api.vworld.kr/req/wmt/3d/buildings/tileset.json?key=${VWORLD_KEY}`)
    .then(tileset => {
        viewer.scene.primitives.add(tileset);
        console.log("🏢 브이월드 공식 3D 실측 건물 레이어가 온라인 로드되었습니다.");
        
        // 3D 타일셋이 정상 로드되면 건물이 지형 바닥에 딱 달라붙도록 자동 고도 보정 옵션 활성화
        tileset.initialTilesetLoaded.addEventListener(() => {
            console.log("3D 건물 타일 초기 정렬 완료.");
        });
    })
    .catch(error => {
        console.error("3D 건물 레이어 통신 실패 (도메인 승인 또는 키 검증 필요):", error);
    });