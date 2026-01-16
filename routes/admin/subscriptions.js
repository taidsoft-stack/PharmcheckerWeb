const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./middleware');
const { getUserEmail } = require('../../utils/admin-email-helper');

// 구독 현황 조회
router.get('/subscriptions', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate = '',
      endDate = '',
      status = '',
      pharmacistName = '',
      pharmacyName = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 구독 조회 (RLS 적용)
    let query = req.supabase
      .from('user_subscriptions')
      .select(`
        subscription_id,
        user_id,
        status,
        current_period_start,
        current_period_end,
        next_billing_at,
        created_at,
        canceled_at,
        cancel_at_period_end,
        billing_plan_id
      `, { count: 'exact' });

    // 상태 필터
    if (status) {
      query = query.eq('status', status);
    }

    // 기간 필터 (구독 시작일 기준)
    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDateTime.toISOString());
    }

    // 최신순 정렬
    query = query.order('created_at', { ascending: false });

    // 페이지네이션
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: subscriptions, error, count } = await query;

    if (error) {
      console.error('[구독 조회 오류]', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    console.log(`[구독 조회] ${subscriptions?.length || 0}건 조회`);

    // 각 구독의 회원 정보 및 실제 결제 금액 조회
    let subscriptionsWithUsers = await Promise.all(
      (subscriptions || []).map(async (sub) => {
        // users 테이블에서 회원 정보 (RLS 적용)
        const { data: user } = await req.supabase
          .from('users')
          .select('pharmacy_name, pharmacist_name')
          .eq('user_id', sub.user_id)
          .single();

        // 플랜 정보 조회 (RLS 적용)
        const { data: plan } = await req.supabase
          .from('subscription_plans')
          .select('plan_name, monthly_price')
          .eq('plan_id', sub.billing_plan_id)
          .single();

        // 이메일 조회 (admin-email-helper 사용)
        const email = await getUserEmail(sub.user_id, req.admin.admin_id, 'subscription_list');

        // 최근 결제 금액 조회 (실제 결제한 금액)
        const { data: recentPayment } = await req.supabase
          .from('billing_payments')
          .select('amount')
          .eq('user_id', sub.user_id)
          .eq('status', 'success')
          .order('approved_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...sub,
          pharmacy_name: user?.pharmacy_name || '',
          pharmacist_name: user?.pharmacist_name || '',
          email: email || '',
          plan_name: plan?.plan_name || '',
          payment_amount: recentPayment?.amount || 0  // 실제 결제 금액
        };
      })
    );

    // 약사명/약국명 필터링 (클라이언트 측)
    if (pharmacistName) {
      subscriptionsWithUsers = subscriptionsWithUsers.filter(sub => 
        sub.pharmacist_name.includes(pharmacistName)
      );
    }
    if (pharmacyName) {
      subscriptionsWithUsers = subscriptionsWithUsers.filter(sub => 
        sub.pharmacy_name.includes(pharmacyName)
      );
    }

    res.json({
      subscriptions: subscriptionsWithUsers,
      total: subscriptionsWithUsers.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(subscriptionsWithUsers.length / parseInt(limit))
    });
  } catch (error) {
    console.error('구독 현황 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
