// proxy-server.js
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

// 내 브이월드 API 키랑 등록 도메인
const VWORLD_API_KEY = '307B0E17-0322-43C3-A570-59947C0FC7A1';
const REGISTERED_DOMAIN = 'http://127.0.0.1:5500'; // 내 로컬 주소

// 프록시 경로 GET 예제 - 타일 요청 받을 때마다 브이월드에 대신 요청
app.get('/proxy/vworld/:z/:y/:x.png', async (req, res) => {
  const { z, y, x } = req.params;

  // 브이월드 타일 URL 완성
  const url = `https://api.vworld.kr/${VWORLD_API_KEY}/Base/${z}/${y}/${x}.png?domain=${encodeURIComponent(REGISTERED_DOMAIN)}`;

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    res.set('Content-Type', 'image/png');

    // CORS 헤더 셋팅해서 클라이언트에서 문제없이 받아가게
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('프록시 요청 실패:', error.message);
    res.status(500).send('브이월드 타일 요청 실패');
  }
});

app.listen(PORT, () => {
  console.log(`프록시 서버 가동 중! http://localhost:${PORT}`);
});