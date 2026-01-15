const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');
const { requireAdmin } = require('./middleware');

// ===== 인증 API =====

// 내 정보 조회
router.get('/me', requireAdmin, async (req, res) => {
  try {
    res.json({
      admin_id: req.admin.admin_id,
      email: req.user.email,
      admin_name: req.admin.admin_name || req.user.email,
      role: req.admin.role
    });
  } catch (error) {
    console.error('내 정보 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ===== 대시보드 API =====

// 대시보드 통계
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    // 전체 회원 수
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);
    
    // 활성 구독 수
    const { count: activeSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // 이번 달 매출
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: payments } = await supabase
      .from('billing_payments')
      .select('amount')
      .eq('status', 'success')
      .gte('approved_at', startOfMonth.toISOString());
    
    const monthlyRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    
    // 활성 프로모션 수
    const { count: activePromotions } = await supabase
      .from('subscription_promotions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    res.json({
      totalUsers: totalUsers || 0,
      activeSubscriptions: activeSubscriptions || 0,
      monthlyRevenue: monthlyRevenue,
      activePromotions: activePromotions || 0
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 최근 활동 로그
router.get('/activities/recent', requireAdmin, async (req, res) => {
  try {
    const { data: activities } = await supabase
      .from('admin_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    res.json({ activities: activities || [] });
  } catch (error) {
    console.error('활동 로그 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ===== 기타 API는 기존 admin.js 참조 =====
// 파일이 너무 커서 점진적으로 이관 예정

module.exports = router;
