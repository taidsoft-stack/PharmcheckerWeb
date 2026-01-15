const express = require('express');
const router = express.Router();

// 로그인 페이지 - Supabase Auth 사용
router.get('/', async (req, res) => {
  // 쿠키 체크 없이 바로 로그인 페이지 렌더링
  // 클라이언트에서 Supabase 세션 확인 후 리다이렉트
  res.render('admin-login');
});

// 명시적 로그인 페이지
router.get('/login', (req, res) => {
  res.render('admin-login');
});

module.exports = router;
