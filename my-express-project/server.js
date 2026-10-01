const express = require('express');
const app = express();

app.use(express.static('./'));  // 이건 app 생성 후에 써야함

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`서버 가동 중! http://localhost:${PORT}`);
});