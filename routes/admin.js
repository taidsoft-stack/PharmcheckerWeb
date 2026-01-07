const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 서버 인스턴스 ID (서버 시작 시마다 새로 생성)
const SERVER_INSTANCE_ID = crypto.randomBytes(16).toString('hex');
const SERVER_START_TIME = Date.now();

console.log(`[Admin] 서버 인스턴스 ID: ${SERVER_INSTANCE_ID}`);
console.log(`[Admin] 서버 시작 시각: ${new Date(SERVER_START_TIME).toISOString()}`);

// ===== 관리자 인증 미들웨어 =====
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[requireAdmin] Authorization 헤더 없음');
    return res.status(401).json({ error: '인증 필요' });
  }
  
  const sessionToken = authHeader.substring(7);
  console.log('[requireAdmin] 받은 토큰 앞 50자:', sessionToken.substring(0, 50));
  console.log('[requireAdmin] 토큰 길이:', sessionToken.length);
  console.log('[requireAdmin] 토큰 끝 20자:', sessionToken.substring(sessionToken.length - 20));
  
  try {
    // 세션 토큰 파싱 (우리가 발급한 커스텀 토큰)
    // 형식: v1.BASE64_PAYLOAD.sig
    const firstDotIndex = sessionToken.indexOf('.');
    const lastDotIndex = sessionToken.lastIndexOf('.');
    console.log('[requireAdmin] firstDotIndex:', firstDotIndex, 'lastDotIndex:', lastDotIndex);
    
    if (firstDotIndex === -1 || lastDotIndex === -1 || firstDotIndex === lastDotIndex) {
      console.log('[requireAdmin] 잘못된 토큰 형식: 구분자 없음');
      return res.status(401).json({ error: '잘못된 토큰 형식' });
    }
    
    const version = sessionToken.substring(0, firstDotIndex);
    const payload = sessionToken.substring(firstDotIndex + 1, lastDotIndex);
    const signature = sessionToken.substring(lastDotIndex + 1);
    
    if (version !== 'v1') {
      console.log('[requireAdmin] 잘못된 토큰 버전:', version);
      return res.status(401).json({ error: '잘못된 토큰 버전' });
    }
    
    const tokenData = JSON.parse(Buffer.from(payload, 'base64').toString());
    console.log('[requireAdmin] 토큰 파싱 성공, email:', tokenData.email);
    
    // 서버 인스턴스 ID 확인 (서버 재시작 시 이전 토큰 무효화)
    if (tokenData.instanceId !== SERVER_INSTANCE_ID) {
      console.log('[requireAdmin] 인스턴스 ID 불일치:', tokenData.instanceId, '!=', SERVER_INSTANCE_ID);
      return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    }
    
    // 토큰에서 idToken 추출
    const idToken = tokenData.idToken;
    
    // Google OAuth ID Token에서 이메일 추출 (간단한 JWT 파싱)
    const oauthPayload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64').toString()
    );
    const email = oauthPayload.email;
    
    if (!email) {
      console.log('[requireAdmin] 이메일 없음');
      return res.status(401).json({ error: '유효하지 않은 토큰' });
    }
    
    console.log('[requireAdmin] 이메일 확인:', email);
    
    // auth.users에서 사용자 조회
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const authUser = users?.find(u => u.email === email);
    
    if (!authUser) {
      console.log('[requireAdmin] 사용자 없음:', email);
      return res.status(401).json({ error: '유효하지 않은 사용자' });
    }
    
    console.log('[requireAdmin] 사용자 확인:', authUser.id);
    
    // 관리자 권한 확인 (public.admins)
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('admin_id', authUser.id)
      .eq('is_active', true)
      .single();
    
    if (adminError || !admin) {
      console.log('[requireAdmin] 관리자 권한 없음:', adminError?.message || '데이터 없음');
      return res.status(403).json({ error: '관리자 권한 없음' });
    }
    
    console.log('[requireAdmin] 인증 성공:', admin.admin_id);
    req.admin = admin;
    req.user = authUser;
    next();
  } catch (error) {
    console.error('[requireAdmin] 인증 오류:', error);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ===== 페이지 렌더링 =====

// 관리자 메인 페이지 (/admin)
router.get('/', async (req, res) => {
  // 서버에서 직접 토큰 검증 후 페이지 렌더링
  const token = req.cookies?.admin_session_token || null;
  
  if (!token) {
    // 토큰이 없으면 로그인 페이지 렌더링
    return res.render('admin-login');
  }
  
  try {
    // 커스텀 세션 토큰 파싱
    // 형식: v1.BASE64_PAYLOAD.sig
    const firstDotIndex = token.indexOf('.');
    const lastDotIndex = token.lastIndexOf('.');
    
    if (firstDotIndex === -1 || lastDotIndex === -1 || firstDotIndex === lastDotIndex) {
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    const version = token.substring(0, firstDotIndex);
    const payload = token.substring(firstDotIndex + 1, lastDotIndex);
    
    if (version !== 'v1') {
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    const tokenData = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    // 서버 인스턴스 ID 확인 (서버 재시작 시 이전 토큰 무효화)
    if (tokenData.instanceId !== SERVER_INSTANCE_ID) {
      console.log('[Admin] 세션 무효: 서버가 재시작되었습니다.');
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    const email = tokenData.email;
    const idToken = tokenData.idToken;
    
    if (!email || !idToken) {
      // 유효하지 않은 토큰 - 쿠키 삭제
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    // 사용자 존재 여부 확인
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const authUser = users?.find(u => u.email === email);
    
    if (!authUser) {
      // 사용자 없음 - 쿠키 삭제
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    // 관리자 권한 확인
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('admin_id', authUser.id)
      .eq('is_active', true)
      .single();
    
    if (adminError || !admin) {
      // 관리자 권한 없음 - 쿠키 삭제
      res.clearCookie('admin_session_token', { path: '/' });
      res.clearCookie('admin_session_token', { path: '/admin' });
      return res.render('admin-login');
    }
    
    // 인증 성공 - 대시보드 렌더링
    return res.render('admin-dashboard', { adminName: email });
    
  } catch (error) {
    console.error('관리자 인증 오류:', error);
    // 토큰 파싱 실패 등 - 쿠키 삭제
    res.clearCookie('admin_session_token', { path: '/' });
    res.clearCookie('admin_session_token', { path: '/admin' });
    return res.render('admin-login');
  }
});

// 로그인 페이지
router.get('/login', (req, res) => {
  res.render('admin-login');
});

// 대시보드 페이지
router.get('/dashboard', (req, res) => {
  res.render('admin-dashboard');
});

// ===== API 엔드포인트 =====

// 로그인 (구글 OAuth)
router.post('/api/login', async (req, res) => {
  const { idToken, email } = req.body;
  
  try {
    console.log('관리자 로그인 시도:', email);
    
    // 1. auth.users에서 이메일로 사용자 조회
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const authUser = users?.find(u => u.email === email);

    if (!authUser) {
      return res.status(401).json({ 
        success: false,
        error: '등록되지 않은 계정입니다' 
      });
    }

    console.log('auth.users 발견:', authUser.id);
    
    // 2. 관리자 권한 확인 (public.admins)
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('*')
      .eq('admin_id', authUser.id)
      .eq('is_active', true)
      .single();
    
    if (adminError || !admin) {
      console.log('관리자 권한 없음:', authUser.id);
      return res.status(403).json({ 
        success: false,
        error: '관리자 권한이 없습니다. 슈퍼 관리자에게 문의하세요.' 
      });
    }

    console.log('관리자 로그인 성공:', admin.admin_id, 'role:', admin.role);
    
    // 3. 세션 기록
    await supabase
      .from('admin_sessions')
      .insert({
        admin_id: admin.admin_id,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      });
    
    // 4. 활동 로그
    await supabase
      .from('admin_activity_logs')
      .insert({
        admin_id: admin.admin_id,
        action: '로그인',
        target_type: 'auth',
        ip_address: req.ip
      });
    
    // 5. 커스텀 세션 토큰 생성 (서버 인스턴스 ID 포함)
    const customToken = {
      idToken: idToken,
      email: authUser.email,
      instanceId: SERVER_INSTANCE_ID,
      issuedAt: Date.now()
    };
    
    // Base64 인코딩 (간단한 JWT 형태)
    const sessionToken = 'v1.' + Buffer.from(JSON.stringify(customToken)).toString('base64') + '.sig';
    
    res.json({
      success: true,
      session_token: sessionToken,
      admin: {
        id: admin.admin_id,
        email: authUser.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('관리자 로그인 오류:', error);
    res.status(500).json({ 
      success: false,
      error: '서버 오류가 발생했습니다' 
    });
  }
});

// 로그아웃
router.post('/api/logout', requireAdmin, async (req, res) => {
  try {
    // 활동 로그 기록
    await supabase
      .from('admin_activity_logs')
      .insert({
        admin_id: req.admin.admin_id,
        action: '로그아웃',
        target_type: 'auth',
        ip_address: req.ip
      });
    
    res.json({ success: true });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 내 정보
router.get('/api/me', requireAdmin, async (req, res) => {
  res.json({
    admin_id: req.admin.admin_id,
    admin_name: req.user.email.split('@')[0],
    email: req.user.email,
    role: req.admin.role
  });
});

// 회원 비고 조회
router.get('/api/users/:userId/memos', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from('admin_user_memos')
      .select(`
        memo_id,
        memo,
        remarks,
        created_at,
        updated_at,
        admin_id,
        admins!admin_user_memos_admin_id_fkey (
          admin_name:email
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('메모 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }
    
    res.json({ memos: data || [] });
  } catch (error) {
    console.error('메모 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 회원 비고 추가/업데이트
router.post('/api/users/:userId/memos', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { remarks } = req.body;
    
    // 기존 메모가 있는지 확인
    const { data: existingMemo } = await supabase
      .from('admin_user_memos')
      .select('memo_id')
      .eq('user_id', userId)
      .eq('admin_id', req.admin.admin_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    let result;
    if (existingMemo) {
      // 기존 메모 업데이트 (remarks만 업데이트, updated_at은 트리거로 자동 처리)
      const { data, error } = await supabase
        .from('admin_user_memos')
        .update({ 
          remarks: remarks
        })
        .eq('memo_id', existingMemo.memo_id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    } else {
      // 새 메모 생성
      const { data, error } = await supabase
        .from('admin_user_memos')
        .insert({
          user_id: userId,
          admin_id: req.admin.admin_id,
          remarks: remarks,
          memo: '' // 빈 메모로 초기화
        })
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    }
    
    // 활동 로그 기록
    await supabase.from('admin_activity_logs').insert({
      admin_id: req.admin.admin_id,
      action_type: existingMemo ? 'update_user_remarks' : 'create_user_remarks',
      target_type: 'user',
      target_id: userId,
      details: { remarks: remarks }
    });
    
    res.json({ success: true, memo: result });
  } catch (error) {
    console.error('메모 저장 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 회원 목록 조회 (검색, 필터링, 페이지네이션)
router.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      name = '',           // 약사명 검색
      email = '',          // 이메일 검색
      startDate = '',      // 기간 검색 시작일
      endDate = '',        // 기간 검색 종료일
      subscriptionStatus = '', // 'active', 'cancelled', 'none'
      accountStatus = '', // 'active', 'deleted'
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // 1단계: 이메일 검색이 있으면 auth.users에서 먼저 필터링
    let emailMatchedUserIds = null;
    if (email) {
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
      emailMatchedUserIds = authUsers
        .filter(u => u.email?.toLowerCase().includes(email.toLowerCase()))
        .map(u => u.id);
      
      if (emailMatchedUserIds.length === 0) {
        return res.json({ users: [], total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 });
      }
    }
    
    // 2단계: users 테이블에서 조건에 맞는 회원 조회
    let query = supabase
      .from('users')
      .select(`
        user_id,
        pharmacist_name,
        pharmacy_name,
        pharmacist_phone,
        is_active,
        is_deleted,
        created_at,
        deleted_at
      `, { count: 'exact' });
    
    // 이메일 검색 결과로 필터링
    if (emailMatchedUserIds) {
      query = query.in('user_id', emailMatchedUserIds);
    }
    
    // 이름 검색 (AND 조건)
    if (name) {
      query = query.ilike('pharmacist_name', `%${name}%`);
    }
    
    // 계정 상태 필터
    if (accountStatus === 'active') {
      query = query.eq('is_deleted', false).eq('is_active', true);
    } else if (accountStatus === 'deleted') {
      query = query.eq('is_deleted', true);
    }
    
    // 정렬
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    
    // 페이지네이션
    query = query.range(offset, offset + parseInt(limit) - 1);
    
    const { data: users, error, count } = await query;
    
    if (error) {
      console.error('회원 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }
    
    // 3단계: 각 회원의 상세 정보 조회
    const usersWithDetails = await Promise.all(
      (users || []).map(async (user) => {
        // 이메일 조회
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user.user_id);
        
        // 활성 구독 조회
        const { data: subscriptions } = await supabase
          .from('user_subscriptions')
          .select(`
            subscription_id,
            status,
            current_period_start,
            current_period_end,
            next_billing_at,
            billing_plan_id,
            subscription_plans!user_subscriptions_billing_plan_id_fkey (plan_name, billing_period, price)
          `)
          .eq('user_id', user.user_id)
          .in('status', ['active', 'cancelled'])
          .order('created_at', { ascending: false })
          .limit(1);
        
        const subscription = subscriptions?.[0];
        
        // 마지막 결제 정보 조회
        const { data: lastPayment } = await supabase
          .from('billing_payments')
          .select('payment_date, amount, status')
          .eq('user_id', user.user_id)
          .eq('status', 'success')
          .order('payment_date', { ascending: false })
          .limit(1)
          .single();
        
        // 적용된 프로모션 조회
        const { data: promotions } = await supabase
          .from('subscription_promotions')
          .select(`
            promotion_id,
            promotion_type,
            discount_rate,
            free_months,
            expires_at,
            is_active
          `)
          .eq('user_id', user.user_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        // 최근 관리자 비고 조회 (가장 최근 업데이트된 비고 1개)
        const { data: memos } = await supabase
          .from('admin_user_memos')
          .select('remarks, memo, created_at, updated_at')
          .eq('user_id', user.user_id)
          .order('updated_at', { ascending: false })
          .limit(1);
        
        return {
          ...user,
          email: authUser?.email || 'N/A',
          subscription: subscription ? {
            status: subscription.status,
            plan_name: subscription.subscription_plans?.plan_name || 'N/A',
            billing_period: subscription.subscription_plans?.billing_period || 'N/A',
            price: subscription.subscription_plans?.price || 0,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            next_billing_at: subscription.next_billing_at
          } : null,
          last_payment: lastPayment ? {
            date: lastPayment.payment_date,
            amount: lastPayment.amount
          } : null,
          active_promotions: promotions || [],
          latest_remarks: memos?.[0]?.remarks || '',
          full_memo: memos?.[0]?.memo || ''
        };
      })
    );
    
    // 4단계: 필터 적용
    let filteredUsers = usersWithDetails;
    
    // 구독 상태 필터
    if (subscriptionStatus === 'active') {
      filteredUsers = filteredUsers.filter(u => u.subscription?.status === 'active');
    } else if (subscriptionStatus === 'cancelled') {
      filteredUsers = filteredUsers.filter(u => u.subscription?.status === 'cancelled');
    } else if (subscriptionStatus === 'none') {
      filteredUsers = filteredUsers.filter(u => !u.subscription);
    }
    
    // 기간 필터 (가입일 또는 구독 기간)
    if (startDate || endDate) {
      filteredUsers = filteredUsers.filter(u => {
        // 구독 상태에 따라 다른 기준 적용
        if (accountStatus === 'deleted') {
          // 탈퇴 회원: 탈퇴일 기준
          const targetDate = new Date(u.deleted_at);
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          
          if (start && targetDate < start) return false;
          if (end && targetDate > end) return false;
          return true;
        } else if (subscriptionStatus === 'active') {
          // 활성 구독: 구독 기간 내 포함 여부
          if (!u.subscription) return false;
          
          const subStart = new Date(u.subscription.current_period_start);
          const subEnd = new Date(u.subscription.current_period_end);
          const filterStart = startDate ? new Date(startDate) : null;
          const filterEnd = endDate ? new Date(endDate) : null;
          
          // 구독 기간이 필터 기간과 겹치는지 확인
          if (filterStart && subEnd < filterStart) return false;
          if (filterEnd && subStart > filterEnd) return false;
          return true;
        } else {
          // 기본: 가입일 기준
          const targetDate = new Date(u.created_at);
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          
          if (start && targetDate < start) return false;
          if (end && targetDate > end) return false;
          return true;
        }
      });
    }
    
    res.json({
      users: filteredUsers,
      total: filteredUsers.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(filteredUsers.length / parseInt(limit))
    });
  } catch (error) {
    console.error('회원 목록 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 대시보드 통계
router.get('/api/dashboard/stats', requireAdmin, async (req, res) => {
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
router.get('/api/activities/recent', requireAdmin, async (req, res) => {
  try {
    const { data: activities } = await supabase
      .from('admin_activity_logs')
      .select(`
        *,
        admins (
          admin_id
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // auth.users에서 이메일 가져오기
    const activitiesWithNames = await Promise.all(
      (activities || []).map(async (act) => {
        const { data: { user } } = await supabase.auth.admin.getUserById(act.admin_id);
        return {
          ...act,
          admin_name: user?.email?.split('@')[0] || '알 수 없음',
          action_type: act.action
        };
      })
    );
    
    res.json(activitiesWithNames);
  } catch (error) {
    console.error('활동 로그 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
