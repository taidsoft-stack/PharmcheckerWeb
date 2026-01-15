const express = require('express');
const router = express.Router();

// 기존 admin.js의 모든 기능을 임포트
const legacyAdminRouter = require('../admin.js.backup');

// 임시로 모든 요청을 기존 라우터로 전달
router.use('/', legacyAdminRouter);

module.exports = router;
