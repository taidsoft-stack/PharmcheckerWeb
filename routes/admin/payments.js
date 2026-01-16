const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./middleware');
const { getUserEmail } = require('../../utils/admin-email-helper');

// 결제 내역 조회
router.get('/payments', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate = '',
      endDate = '',
      status = '',
      pharmacyName = '',
      pharmacistName = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 결제 내역 조회 (RLS 적용)
    let query = req.supabase
      .from('billing_payments')
      .select(`
        payment_id,
        subscription_id,
        user_id,
        order_id,
        payment_key,
        amount,
        status,
        fail_reason,
        requested_at,
        approved_at,
        created_at
      `, { count: 'exact' });

    // 상태 필터
    if (status) {
      query = query.eq('status', status);
    }

    // 기간 필터 (결제 요청일 기준)
    if (startDate) {
      query = query.gte('requested_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query = query.lte('requested_at', endDateTime.toISOString());
    }

    // 최신순 정렬
    query = query.order('requested_at', { ascending: false });

    // 페이지네이션
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: payments, error, count } = await query;

    if (error) {
      console.error('[결제 내역 조회 오류]', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    // 각 결제의 회원 정보 조회
    const paymentsWithUsers = await Promise.all(
      (payments || []).map(async (payment) => {
        // users 테이블에서 회원 정보 (RLS 적용)
        const { data: user } = await req.supabase
          .from('users')
          .select('pharmacy_name, pharmacist_name')
          .eq('user_id', payment.user_id)
          .single();

        // 이메일 조회 (admin-email-helper 사용)
        const email = await getUserEmail(payment.user_id, req.admin.admin_id, 'payment_list');

        return {
          ...payment,
          pharmacy_name: user?.pharmacy_name || '',
          pharmacist_name: user?.pharmacist_name || '',
          email: email || ''
        };
      })
    );

    // 약국명/약사명 필터링 (클라이언트에서 전달받은 경우)
    let filteredPayments = paymentsWithUsers;
    if (pharmacyName || pharmacistName) {
      filteredPayments = paymentsWithUsers.filter(payment => {
        const matchPharmacy = !pharmacyName || 
          (payment.pharmacy_name && payment.pharmacy_name.toLowerCase().includes(pharmacyName.toLowerCase()));
        const matchPharmacist = !pharmacistName || 
          (payment.pharmacist_name && payment.pharmacist_name.toLowerCase().includes(pharmacistName.toLowerCase()));
        return matchPharmacy && matchPharmacist;
      });
    }

    res.json({
      payments: filteredPayments,
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / parseInt(limit))
    });
  } catch (error) {
    console.error('결제 내역 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
