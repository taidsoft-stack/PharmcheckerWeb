const express = require('express');
const router = express.Router();

// 대시보드 페이지 - Supabase Auth 사용
router.get('/', async (req, res) => {
  // 쿠키 체크 없이 바로 대시보드 렌더링
  // 클라이언트에서 Supabase 세션 확인 후 인증 처리
  res.render('admin-dashboard');
});

module.exports = router;
