const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { getUserEmail, getUserEmailsBatch, getAdminEmail } = require('../utils/admin-email-helper');
const multer = require('multer');
const path = require('path');

// Multer 설정 (메모리 스토리지 사용 - 관리자 답변 파일 업로드용)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // 최대 5개
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('허용되지 않는 파일 형식입니다.'));
    }
  }
});

// ===== 관리자 인증 미들웨어 (Supabase Auth 기반) =====
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 필요' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // 커스텀 세션 토큰 파싱 (v1.{base64}.sig 형식)
    let actualToken = token;
    
    if (token.startsWith('v1.') && token.endsWith('.sig')) {
      try {
        const base64Part = token.slice(3, -4);
        const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf8'));
        actualToken = decoded.idToken;
      } catch (decodeError) {
        console.error('[requireAdmin] 커스텀 토큰 디코딩 실패:', decodeError.message);
        return res.status(401).json({ error: '잘못된 토큰 형식' });
      }
    }
    
    // Supabase에서 토큰 검증
    const { data: { user }, error } = await supabase.auth.getUser(actualToken);
    
    if (error || !user) {
      console.error('[requireAdmin] 토큰 검증 실패:', error);
      return res.status(401).json({ error: '유효하지 않은 토큰' });
    }
    
    // 인증된 Supabase 클라이언트 생성 (RLS 적용)
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${actualToken}`
          }
        }
      }
    );
    
    // 관리자 권한 확인 (RLS 정책이 자동으로 확인)
    const { data: admin, error: adminError } = await req.supabase
      .from('admins')
      .select('*')
      .eq('admin_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (adminError || !admin) {
      return res.status(403).json({ error: '관리자 권한 없음' });
    }
    
    req.admin = admin;
    req.user = user;
    req.accessToken = actualToken;
    next();
  } catch (error) {
    console.error('[requireAdmin] 인증 오류:', error);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ===== 페이지 렌더링 =====

// 관리자 메인 페이지 (/admin)
// OAuth 콜백 URL로 사용 (리다이렉트 없이 직접 렌더링)
router.get('/', async (req, res) => {
  // OAuth 콜백이 /admin#access_token=... 형식으로 올 수 있으므로
  // 리다이렉트 없이 대시보드를 직접 렌더링 (URL 해시 유지)
  res.render('admin-dashboard');
});

// 로그인 페이지
router.get('/login', (req, res) => {
  res.render('admin-login');
});

// 대시보드 페이지 - Supabase 세션 필요
router.get('/dashboard', async (req, res) => {
  // 페이지는 렌더링하되, 클라이언트에서 Supabase 세션 확인
  // 세션 없으면 자동으로 /admin/login으로 리다이렉트
  res.render('admin-dashboard');
});

// 회원 관리 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/users', async (req, res) => {
  res.render('admin-users');
});

// 모바일 조회 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/mobile', (req, res) => {
  res.render('admin-mobile');
});

// 구독 현황 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/subscriptions', (req, res) => {
  res.render('admin-subscriptions');
});

// 결제 내역 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/payments', (req, res) => {
  res.render('admin-payments');
});

// 문의 내역 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/support-tickets', (req, res) => {
  res.render('admin-support-tickets');
});

// 원격 지원 관리 페이지 (현재 사용 안 함 - 대시보드 내부에서 처리)
router.get('/remote-support', (req, res) => {
  res.render('admin-remote-support');
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

// 대시보드 통계
router.get('/api/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    // 전체 회원 수 (RLS 정책: is_admin() 함수로 전체 접근)
    const { data: usersData, count: totalUsers, error: usersError } = await req.supabase
      .from('users')
      .select('user_id', { count: 'exact' })
      .eq('is_deleted', false);
    
    if (usersError) {
      console.error('회원 수 조회 에러:', usersError);
    }
    
    // 활성 구독 수
    const { data: subsData, count: activeSubscriptions, error: subsError } = await req.supabase
      .from('user_subscriptions')
      .select('subscription_id', { count: 'exact' })
      .eq('status', 'active');
    
    if (subsError) {
      console.error('구독 수 조회 에러:', subsError);
    }
    
    // 이번 달 매출
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: payments, error: paymentsError } = await req.supabase
      .from('billing_payments')
      .select('amount')
      .eq('status', 'success')
      .gte('approved_at', startOfMonth.toISOString());
    
    if (paymentsError) {
      console.error('결제 내역 조회 에러:', paymentsError);
    }
    
    const monthlyRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    
    // 활성 프로모션 수
    const { data: promosData, count: activePromotions, error: promosError } = await req.supabase
      .from('subscription_promotions')
      .select('promotion_id', { count: 'exact' })
      .eq('is_active', true);
    
    if (promosError) {
      console.error('프로모션 수 조회 에러:', promosError);
    }
    
    const result = {
      totalUsers: totalUsers || 0,
      activeSubscriptions: activeSubscriptions || 0,
      monthlyRevenue: monthlyRevenue,
      activePromotions: activePromotions || 0
    };
    
    res.json(result);
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

// 문의 관리 - 목록 조회
router.get('/api/support-tickets', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 문의 조회 (RLS 적용)
    let query = req.supabase
      .from('support_tickets')
      .select('*', { count: 'exact' });

    // 상태 필터
    if (status) {
      query = query.eq('status', status);
    }

    // 최신순 정렬
    query = query.order('created_at', { ascending: false });

    // 페이지네이션
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: tickets, error, count } = await query;

    if (error) {
      console.error('[문의 조회 오류]', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    // 각 문의의 회원 정보 조회
    const ticketsWithUsers = await Promise.all(
      (tickets || []).map(async (ticket) => {
        // users 테이블에서 회원 정보 (RLS 적용)
        const { data: user } = await req.supabase
          .from('users')
          .select('pharmacy_name, pharmacist_name')
          .eq('user_id', ticket.user_id)
          .single();

        // 이메일 조회 (admin-email-helper 사용)
        const email = await getUserEmail(ticket.user_id, req.admin.admin_id, 'support_ticket_list');

        return {
          ...ticket,
          pharmacy_name: user?.pharmacy_name || '',
          pharmacist_name: user?.pharmacist_name || '',
          email: email || ''
        };
      })
    );

    res.json({
      tickets: ticketsWithUsers,
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / parseInt(limit))
    });
  } catch (error) {
    console.error('문의 목록 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 문의 관리 - 상세 조회
router.get('/api/support-tickets/:ticketId', requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;

    // 문의 상세 정보 (RLS 적용)
    const { data: ticket, error: ticketError } = await req.supabase
      .from('support_tickets')
      .select('*')
      .eq('ticket_id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: '문의를 찾을 수 없습니다.' });
    }

    // 문의 첨부파일 조회 (RLS 적용)
    const { data: attachments } = await req.supabase
      .from('support_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .is('reply_id', null)
      .order('created_at', { ascending: true });

    // 답변 조회 (RLS 적용)
    const { data: replies } = await req.supabase
      .from('support_replies')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    console.log('답변 조회:', { count: replies?.length || 0 });

    // 답변 첨부파일 조회 (reply_id가 있는 것만)
    const replyIds = replies?.map(r => r.reply_id) || [];
    let replyAttachments = [];
    if (replyIds.length > 0) {
      const { data: replyAttachmentsData } = await supabase
        .from('support_attachments')
        .select('*')
        .in('reply_id', replyIds);
      replyAttachments = replyAttachmentsData || [];
      console.log('답변 첨부파일 조회:', { count: replyAttachments.length });
    }

    // 회원 정보
    const { data: user } = await supabase
      .from('users')
      .select('pharmacy_name, pharmacist_name')
      .eq('user_id', ticket.user_id)
      .single();

    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(ticket.user_id);

    // 첨부파일 URL 생성 (Signed URL 방식 - Private Storage)
    const attachmentsWithUrl = await Promise.all((attachments || []).map(async (att) => {
      // Signed URL 생성 (1시간 유효) - service_role 권한으로 발급
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('support-attachments')
        .createSignedUrl(att.file_path, 3600);
      
      if (signedError) {
        console.error('Signed URL 생성 실패:', att.file_name, signedError);
      }
      
      return {
        ...att,
        file_url: signedData?.signedUrl || null // Signed URL만 사용 (Public URL 없음)
      };
    }));

    const replyAttachmentsWithUrl = await Promise.all(replyAttachments.map(async (att) => {
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('support-attachments')
        .createSignedUrl(att.file_path, 3600);
      
      if (signedError) {
        console.error('답변 첨부 Signed URL 생성 실패:', att.file_name, signedError);
      }
      
      return {
        ...att,
        file_url: signedData?.signedUrl || null
      };
    }));

    console.log('첨부파일 Signed URL 생성 완료:', {
      count: attachmentsWithUrl.length,
      samples: attachmentsWithUrl.slice(0, 2).map(a => ({ 
        file_name: a.file_name, 
        has_url: !!a.file_url,
        url_preview: a.file_url?.substring(0, 80) + '...'
      }))
    });

    // 답변에 admin_email 추가
    const repliesWithEmail = await Promise.all((replies || []).map(async (reply) => {
      const adminEmail = await getAdminEmail(req.supabase, reply.admin_id);
      return {
        ...reply,
        admin_email: adminEmail
      };
    }));

    res.json({
      ticket: {
        ...ticket,
        pharmacy_name: user?.pharmacy_name || '',
        pharmacist_name: user?.pharmacist_name || '',
        email: authUser?.email || ''
      },
      attachments: attachmentsWithUrl,
      replies: repliesWithEmail,
      reply_attachments: replyAttachmentsWithUrl
    });
  } catch (error) {
    console.error('문의 상세 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 문의 관리 - 답변 작성 (multer로 파일 업로드 지원)
router.post('/api/support-tickets/:ticketId/reply', requireAdmin, upload.array('attachments', 5), async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reply_content } = req.body;
    const adminId = req.admin.admin_id; // requireAdmin에서 설정됨

    if (!reply_content?.trim()) {
      return res.status(400).json({ error: '답변 내용을 입력해주세요.' });
    }

    // 답변 저장 (RLS 적용)
    const { data: reply, error: replyError } = await req.supabase
      .from('support_replies')
      .insert({
        ticket_id: ticketId,
        admin_id: adminId,
        reply_content: reply_content.trim(),
        is_public: true
      })
      .select()
      .single();

    if (replyError) {
      console.error('[답변 저장 오류]', replyError);
      throw replyError;
    }

    // 첨부파일 업로드 (support.js와 동일한 로직)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileExt = path.extname(file.originalname);
        
        // 한글 파일명 처리: Buffer로 올바르게 디코딩
        const originalFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        
        const fileName = `${timestamp}_${randomStr}${fileExt}`;
        const filePath = `${ticketId}/${fileName}`;

        // Storage에 업로드 (RLS 적용)
        const { data: uploadData, error: uploadError } = await req.supabase
          .storage
          .from('support-attachments')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          console.error('[파일 업로드 오류]', uploadError);
          continue; // 실패해도 계속 진행
        }

        // 메타데이터 저장 (RLS 적용)
        const { error: metaError } = await req.supabase
          .from('support_attachments')
          .insert({
            ticket_id: ticketId,
            reply_id: reply.reply_id,
            file_path: filePath,
            file_name: originalFileName,
            mime_type: file.mimetype,
            file_size: file.size,
            uploaded_by: 'admin'
          });

        if (metaError) {
          console.error('[첨부파일 메타데이터 저장 오류]', metaError);
        }
      }
    }

    // 문의 상태를 'answered'로 업데이트 (RLS 적용)
    const { error: updateError } = await req.supabase
      .from('support_tickets')
      .update({ status: 'answered', updated_at: new Date().toISOString() })
      .eq('ticket_id', ticketId);
    
    if (updateError) {
      console.error('[문의 상태 업데이트 오류]', updateError);
    }

    res.json({ success: true, reply });
  } catch (error) {
    console.error('[답변 작성 오류]', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ==================== 원격 지원 관리 ====================

// 원격 지원 목록 조회
router.get('/api/remote-sessions', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 원격 지원 세션 조회 (RLS 정책: is_admin() 함수로 전체 접근)
    let query = req.supabase
      .from('remote_support_sessions')
      .select(`
        session_id,
        session_number,
        user_id,
        customer_phone,
        requested_at,
        agent_id,
        connected_at,
        connection_note,
        issue_category,
        notes,
        resolution,
        ended_at,
        status,
        created_at,
        updated_at
      `, { count: 'exact' });

    // 상태 필터
    if (status) {
      query = query.eq('status', status);
    }

    // 기간 필터 (요청일 기준)
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

    const { data: sessions, error, count } = await query;

    if (error) {
      console.error('[원격 지원 조회 오류]', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    // 각 세션의 회원 정보 조회
    const sessionsWithUsers = await Promise.all(
      (sessions || []).map(async (session) => {
        // users 테이블에서 회원 정보 (RLS 정책: is_admin() 함수로 전체 접근)
        const { data: user } = await req.supabase
          .from('users')
          .select('pharmacy_name, pharmacist_name')
          .eq('user_id', session.user_id)
          .single();

        // 이메일 조회 (admin-email-helper 사용)
        const email = await getUserEmail(session.user_id, req.admin.admin_id, 'remote_session_list');

        // agent_id가 있으면 상담원 정보도 조회
        let agentEmail = '';
        if (session.agent_id) {
          agentEmail = await getAdminEmail(req.supabase, session.agent_id);
        }

        return {
          ...session,
          pharmacy_name: user?.pharmacy_name || '',
          pharmacist_name: user?.pharmacist_name || '',
          email: email || '',
          agent_email: agentEmail
        };
      })
    );

    res.json({
      sessions: sessionsWithUsers,
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / parseInt(limit))
    });
  } catch (error) {
    console.error('원격 지원 목록 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 원격 지원 상세 조회
router.get('/api/remote-sessions/:sessionId', requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 원격 지원 세션 조회 (RLS 정책: is_admin() 함수로 전체 접근)
    const { data: session, error } = await req.supabase
      .from('remote_support_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error || !session) {
      console.error('[원격 지원 상세 조회 오류]', error);
      return res.status(404).json({ error: '원격 지원 세션을 찾을 수 없습니다.' });
    }

    // 회원 정보 조회 (RLS 정책: is_admin() 함수로 전체 접근)
    const { data: user } = await req.supabase
      .from('users')
      .select('pharmacy_name, pharmacist_name')
      .eq('user_id', session.user_id)
      .single();

    // 이메일 조회 (admin-email-helper 사용)
    const email = await getUserEmail(session.user_id, req.admin.admin_id, 'remote_session_detail');

    // agent_id가 있으면 상담원 정보도 조회
    let agentEmail = '';
    if (session.agent_id) {
      agentEmail = await getAdminEmail(req.supabase, session.agent_id);
    }

    res.json({
      ...session,
      pharmacy_name: user?.pharmacy_name || '',
      pharmacist_name: user?.pharmacist_name || '',
      email: email || '',
      agent_email: agentEmail
    });
  } catch (error) {
    console.error('원격 지원 상세 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 원격 지원 상태 업데이트 (시작, 완료, 취소)
router.patch('/api/remote-sessions/:sessionId', requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const adminId = req.user.id;  // authUser.id
    const { 
      status, 
      connection_note, 
      issue_category, 
      notes, 
      resolution 
    } = req.body;

    // 유효성 검사
    if (!status || !['requested', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
    }

    // 업데이트할 데이터 준비
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    // 상담원 ID는 항상 현재 관리자로 설정 (없는 경우에만)
    const { data: existingSession } = await req.supabase
      .from('remote_support_sessions')
      .select('agent_id')
      .eq('session_id', sessionId)
      .single();

    // agent_id가 없는 경우에만 현재 관리자로 설정
    if (!existingSession?.agent_id) {
      updateData.agent_id = adminId;
    }

    // 상태별 추가 처리
    if (status === 'in_progress') {
      updateData.connected_at = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.ended_at = new Date().toISOString();
    }

    // 선택적 필드 업데이트
    if (connection_note !== undefined) updateData.connection_note = connection_note;
    if (issue_category !== undefined) updateData.issue_category = issue_category;
    if (notes !== undefined) updateData.notes = notes;
    if (resolution !== undefined) updateData.resolution = resolution;

    // 세션 업데이트 (RLS 정책: is_admin() 함수로 전체 접근)
    const { data: updatedSession, error } = await req.supabase
      .from('remote_support_sessions')
      .update(updateData)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('원격 지원 업데이트 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    // 업데이트된 세션의 상담원 정보 조회
    let agentEmail = '';
    if (updatedSession.agent_id) {
      agentEmail = await getAdminEmail(req.supabase, updatedSession.agent_id);
    }

    res.json({ 
      success: true, 
      session: {
        ...updatedSession,
        agent_email: agentEmail
      }
    });
  } catch (error) {
    console.error('원격 지원 업데이트 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ===========================
// FAQ 관리 API
// ===========================

// FAQ 목록 조회
router.get('/api/faqs', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('faqs')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FAQ 목록 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, faqs: data });
  } catch (error) {
    console.error('FAQ 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// FAQ 생성
router.post('/api/faqs', requireAdmin, async (req, res) => {
  try {
    const { question, answer, is_active, display_order } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: '질문과 답변을 입력해주세요.' });
    }

    const { data, error } = await req.supabase
      .from('faqs')
      .insert({
        question,
        answer,
        is_active: is_active !== undefined ? is_active : true,
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      console.error('FAQ 생성 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, faq: data });
  } catch (error) {
    console.error('FAQ 생성 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// FAQ 수정
router.put('/api/faqs/:faqId', requireAdmin, async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, is_active, display_order } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: '질문과 답변을 입력해주세요.' });
    }

    const { data, error } = await req.supabase
      .from('faqs')
      .update({
        question,
        answer,
        is_active,
        display_order,
        updated_at: new Date().toISOString()
      })
      .eq('faq_id', faqId)
      .select()
      .single();

    if (error) {
      console.error('FAQ 수정 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, faq: data });
  } catch (error) {
    console.error('FAQ 수정 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// FAQ 삭제
router.delete('/api/faqs/:faqId', requireAdmin, async (req, res) => {
  try {
    const { faqId } = req.params;

    const { error } = await req.supabase
      .from('faqs')
      .delete()
      .eq('faq_id', faqId);

    if (error) {
      console.error('FAQ 삭제 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('FAQ 삭제 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 프로모션 관리 API
// ===========================

// 프로모션 목록 조회
router.get('/api/promotions', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('subscription_promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('프로모션 목록 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, promotions: data });
  } catch (error) {
    console.error('프로모션 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 생성
router.post('/api/promotions', requireAdmin, async (req, res) => {
  try {
    const { 
      promotion_code, 
      promotion_name, 
      discount_type, 
      discount_value, 
      free_months, 
      start_at, 
      end_at, 
      is_active,
      first_payment_only,
      max_usage_per_user,
      allow_duplicate
    } = req.body;

    if (!promotion_code || !promotion_name || !discount_type) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    if (!['percent', 'amount', 'free'].includes(discount_type)) {
      return res.status(400).json({ error: '유효하지 않은 할인 유형입니다.' });
    }

    const { data: existingPromo } = await req.supabase
      .from('subscription_promotions')
      .select('promotion_id')
      .eq('promotion_code', promotion_code)
      .single();

    if (existingPromo) {
      return res.status(400).json({ error: '이미 사용 중인 프로모션 코드입니다.' });
    }

    const { data, error } = await req.supabase
      .from('subscription_promotions')
      .insert({
        promotion_code,
        promotion_name,
        discount_type,
        discount_value: discount_value || null,
        free_months: free_months || null,
        start_at: start_at || null,
        end_at: end_at || null,
        is_active: is_active !== undefined ? is_active : true,
        first_payment_only: first_payment_only !== undefined ? first_payment_only : true,  // 기본값 true
        max_usage_per_user: max_usage_per_user || 1,
        allow_duplicate: false  // 항상 false (프로모션 중복 불가)
      })
      .select()
      .single();

    if (error) {
      console.error('프로모션 생성 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, promotion: data });
  } catch (error) {
    console.error('프로모션 생성 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 수정
router.put('/api/promotions/:promotionId', requireAdmin, async (req, res) => {
  try {
    const { promotionId } = req.params;
    const { 
      promotion_code, 
      promotion_name, 
      discount_type, 
      discount_value, 
      free_months, 
      start_at, 
      end_at, 
      is_active,
      first_payment_only,
      max_usage_per_user,
      allow_duplicate
    } = req.body;

    if (!promotion_code || !promotion_name || !discount_type) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    const { data: existingPromo } = await req.supabase
      .from('subscription_promotions')
      .select('promotion_id')
      .eq('promotion_code', promotion_code)
      .neq('promotion_id', promotionId)
      .single();

    if (existingPromo) {
      return res.status(400).json({ error: '이미 사용 중인 프로모션 코드입니다.' });
    }

    const { data, error } = await req.supabase
      .from('subscription_promotions')
      .update({
        promotion_code,
        promotion_name,
        discount_type,
        discount_value: discount_value || null,
        free_months: free_months || null,
        start_at: start_at || null,
        end_at: end_at || null,
        is_active,
        first_payment_only: first_payment_only !== undefined ? first_payment_only : false,
        max_usage_per_user: max_usage_per_user || null,
        allow_duplicate: false  // 항상 false (프로모션 중복 불가)
      })
      .eq('promotion_id', promotionId)
      .select()
      .single();

    if (error) {
      console.error('프로모션 수정 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, promotion: data });
  } catch (error) {
    console.error('프로모션 수정 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 삭제
router.delete('/api/promotions/:promotionId', requireAdmin, async (req, res) => {
  try {
    const { promotionId } = req.params;

    const { data: activeSubscriptions } = await req.supabase
      .from('user_subscriptions')
      .select('subscription_id')
      .eq('promotion_id', promotionId)
      .limit(1);

    if (activeSubscriptions && activeSubscriptions.length > 0) {
      return res.status(400).json({ 
        error: '현재 사용 중인 프로모션은 삭제할 수 없습니다. 비활성화로 변경해주세요.' 
      });
    }

    const { data: linkedReferralCodes } = await req.supabase
      .from('referral_codes')
      .select('referral_code_id')
      .eq('promotion_id', promotionId)
      .limit(1);

    if (linkedReferralCodes && linkedReferralCodes.length > 0) {
      return res.status(400).json({ 
        error: '추천인 코드와 연결된 프로모션은 삭제할 수 없습니다.' 
      });
    }

    const { error } = await req.supabase
      .from('subscription_promotions')
      .delete()
      .eq('promotion_id', promotionId);

    if (error) {
      console.error('프로모션 삭제 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('프로모션 삭제 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 플랜 관리 API
// ===========================

// 플랜 목록 조회
router.get('/api/plans', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('subscription_plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('플랜 목록 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, plans: data });
  } catch (error) {
    console.error('플랜 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 플랜 생성
router.post('/api/plans', requireAdmin, async (req, res) => {
  try {
    const {
      plan_code,
      plan_name,
      monthly_price,
      daily_rx_limit,
      description,
      is_active
    } = req.body;

    const { data, error } = await req.supabase
      .from('subscription_plans')
      .insert([{
        plan_code,
        plan_name,
        monthly_price,
        daily_rx_limit: daily_rx_limit || null,
        description: description || null,
        is_active: is_active !== false
      }])
      .select()
      .single();

    if (error) {
      console.error('플랜 생성 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, plan: data });
  } catch (error) {
    console.error('플랜 생성 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 플랜 수정
router.put('/api/plans/:planId', requireAdmin, async (req, res) => {
  try {
    const { planId } = req.params;
    const {
      plan_code,
      plan_name,
      monthly_price,
      daily_rx_limit,
      description,
      is_active
    } = req.body;

    const { data, error } = await req.supabase
      .from('subscription_plans')
      .update({
        plan_code,
        plan_name,
        monthly_price,
        daily_rx_limit: daily_rx_limit || null,
        description: description || null,
        is_active
      })
      .eq('plan_id', planId)
      .select()
      .single();

    if (error) {
      console.error('플랜 수정 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, plan: data });
  } catch (error) {
    console.error('플랜 수정 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 플랜 삭제
router.delete('/api/plans/:planId', requireAdmin, async (req, res) => {
  try {
    const { planId } = req.params;

    // 해당 플랜을 사용하는 구독이 있는지 확인
    const { count } = await req.supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .or(`entry_plan_id.eq.${planId},billing_plan_id.eq.${planId}`);

    if (count && count > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '이 플랜을 사용 중인 구독이 있어 삭제할 수 없습니다. 비활성화를 권장합니다.' 
      });
    }

    const { error } = await req.supabase
      .from('subscription_plans')
      .delete()
      .eq('plan_id', planId);

    if (error) {
      console.error('플랜 삭제 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('플랜 삭제 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 추천인 코드 관리 API
// ===========================

// 추천인 코드 목록 조회
router.get('/api/referral-codes', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('referral_codes')
      .select(`
        *,
        subscription_promotions (
          promotion_name,
          discount_type,
          discount_value,
          free_months
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('추천인 코드 목록 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, referralCodes: data });
  } catch (error) {
    console.error('추천인 코드 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 추천인 코드 생성
router.post('/api/referral-codes', requireAdmin, async (req, res) => {
  try {
    const { code, promotion_id, description, max_uses, expires_at, is_active } = req.body;

    if (!code || !promotion_id) {
      return res.status(400).json({ error: '추천인 코드와 프로모션을 선택해주세요.' });
    }

    const { data: existingCode } = await req.supabase
      .from('referral_codes')
      .select('referral_code_id')
      .eq('code', code)
      .single();

    if (existingCode) {
      return res.status(400).json({ error: '이미 사용 중인 추천인 코드입니다.' });
    }

    const { data: promotion } = await req.supabase
      .from('subscription_promotions')
      .select('promotion_id')
      .eq('promotion_id', promotion_id)
      .single();

    if (!promotion) {
      return res.status(400).json({ error: '유효하지 않은 프로모션입니다.' });
    }

    const { data, error } = await req.supabase
      .from('referral_codes')
      .insert({
        code,
        promotion_id,
        description: description || null,
        max_uses: max_uses || null,
        expires_at: expires_at || null,
        is_active: is_active !== undefined ? is_active : true
      })
      .select()
      .single();

    if (error) {
      console.error('추천인 코드 생성 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, referralCode: data });
  } catch (error) {
    console.error('추천인 코드 생성 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 추천인 코드 수정
router.put('/api/referral-codes/:referralCodeId', requireAdmin, async (req, res) => {
  try {
    const { referralCodeId } = req.params;
    const { code, promotion_id, description, max_uses, expires_at, is_active } = req.body;

    if (!code || !promotion_id) {
      return res.status(400).json({ error: '추천인 코드와 프로모션을 선택해주세요.' });
    }

    const { data: existingCode } = await req.supabase
      .from('referral_codes')
      .select('referral_code_id')
      .eq('code', code)
      .neq('referral_code_id', referralCodeId)
      .single();

    if (existingCode) {
      return res.status(400).json({ error: '이미 사용 중인 추천인 코드입니다.' });
    }

    const { data, error } = await req.supabase
      .from('referral_codes')
      .update({
        code,
        promotion_id,
        description: description || null,
        max_uses: max_uses || null,
        expires_at: expires_at || null,
        is_active
      })
      .eq('referral_code_id', referralCodeId)
      .select()
      .single();

    if (error) {
      console.error('추천인 코드 수정 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, referralCode: data });
  } catch (error) {
    console.error('추천인 코드 수정 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 추천인 코드 삭제
router.delete('/api/referral-codes/:referralCodeId', requireAdmin, async (req, res) => {
  try {
    const { referralCodeId } = req.params;

    const { data: referralCode } = await req.supabase
      .from('referral_codes')
      .select('used_count')
      .eq('referral_code_id', referralCodeId)
      .single();

    if (referralCode && referralCode.used_count > 0) {
      return res.status(400).json({ 
        error: '이미 사용된 추천인 코드는 삭제할 수 없습니다. 비활성화로 변경해주세요.' 
      });
    }

    const { error } = await req.supabase
      .from('referral_codes')
      .delete()
      .eq('referral_code_id', referralCodeId);

    if (error) {
      console.error('추천인 코드 삭제 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('추천인 코드 삭제 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 프로모션 할당 관리 API
// ===========================

// 할당 가능한 프로모션 목록 조회
router.get('/api/assign-promotion/available-promotions', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('subscription_promotions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('할당 가능 프로모션 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, promotions: data });
  } catch (error) {
    console.error('할당 가능 프로모션 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 할당 대상 사용자 목록 조회
router.get('/api/assign-promotion/eligible-users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id,
        pharmacist_name,
        pharmacy_name,
        pharmacist_phone,
        business_number,
        created_at,
        user_subscriptions (
          subscription_id,
          status,
          created_at
        )
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('할당 대상 사용자 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true, users: data });
  } catch (error) {
    console.error('할당 대상 사용자 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 프로모션 할당 API (신규 - LLM 설계 기반)
// ===========================

// 첫 결제 예정 고객 목록 조회
router.get('/api/assign-promotion/candidates', requireAdmin, async (req, res) => {
  try {
    const { pharmacist_name, pharmacy_name } = req.query;

    // 기본 회원 조회
    let query = supabase
      .from('users')
      .select('user_id, pharmacist_name, pharmacy_name, pharmacist_phone, business_number, created_at, is_returning_customer')
      .eq('is_deleted', false);

    if (pharmacist_name) {
      query = query.ilike('pharmacist_name', `%${pharmacist_name}%`);
    }

    if (pharmacy_name) {
      query = query.ilike('pharmacy_name', `%${pharmacy_name}%`);
    }

    const { data: users, error: usersError } = await query.order('created_at', { ascending: false }).limit(100);

    if (usersError) throw usersError;

    if (!users || users.length === 0) {
      return res.json({ success: true, candidates: [] });
    }

    const userIds = users.map(u => u.user_id);

    // 이메일 정보
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = {};
    if (authUsers) {
      authUsers.users.forEach(au => {
        emailMap[au.id] = au.email;
      });
    }

    // 구독 상태
    const { data: subscriptions } = await supabase
      .from('user_subscriptions')
      .select('user_id, status, next_billing_at')
      .in('user_id', userIds);

    const subscriptionMap = {};
    if (subscriptions) {
      subscriptions.forEach(sub => {
        subscriptionMap[sub.user_id] = sub;
      });
    }

    // 데이터 조합
    const candidates = users.map(user => {
      const subscription = subscriptionMap[user.user_id] || null;
      
      // ✅ 재가입 여부는 users.is_returning_customer 컬럼에서 확인
      const isFirstPayment = !user.is_returning_customer;

      // 자동결제 중이면 제외
      if (subscription && subscription.status === 'active') {
        return null;
      }

      // 첫 결제가 아니면 제외
      if (!isFirstPayment) {
        return null;
      }

      return {
        user_id: user.user_id,
        pharmacist_name: user.pharmacist_name,
        pharmacy_name: user.pharmacy_name,
        pharmacist_phone: user.pharmacist_phone,
        business_number: user.business_number,
        email: emailMap[user.user_id] || null,
        created_at: user.created_at,
        subscription_status: subscription?.status || null,
        next_billing_at: subscription?.next_billing_at || null,
        is_first_payment: isFirstPayment,
        has_pending_promotion: hasPendingMap.has(user.user_id)
      };
    }).filter(Boolean);

    res.json({ success: true, candidates });

  } catch (error) {
    console.error('후보 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 회원 프로모션 이력 조회
router.get('/api/users/:userId/promotion-history', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { business_number } = req.query;

    if (!business_number) {
      return res.json({ success: true, history: [] });
    }

    const { data, error } = await supabase
      .from('promotion_usage_history')
      .select('*')
      .eq('business_number', business_number)
      .order('last_applied_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, history: data || [] });

  } catch (error) {
    console.error('프로모션 이력 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 회원 구독 상태 조회
router.get('/api/users/:userId/subscription-status', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: payments } = await supabase
      .from('billing_payments')
      .select('amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({ 
      success: true, 
      subscription: subscription || null,
      payments: payments || []
    });

  } catch (error) {
    console.error('구독 상태 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 회원 예약 프로모션 조회
router.get('/api/users/:userId/pending-promotions', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('pending_user_promotions')
      .select(`
        *,
        subscription_promotions (
          promotion_name,
          promotion_code
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false});

    if (error) throw error;

    const pending = (data || []).map(p => ({
      ...p,
      promotion_name: p.subscription_promotions?.promotion_name || '(알 수 없음)',
      promotion_code: p.subscription_promotions?.promotion_code || ''
    }));

    res.json({ success: true, pending });

  } catch (error) {
    console.error('예약 프로모션 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// ===========================
// 프로모션 할당 API (기존)
// ===========================

// 프로모션 적용 이력 조회 (billing_payments 기반)
router.get('/api/promotion-applied-history', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('billing_payments')
      .select(`
        payment_id,
        user_id,
        amount,
        approved_at,
        status,
        created_at,
        promotion_id,
        users!user_id (
          pharmacist_name,
          pharmacy_name,
          business_number
        ),
        subscription_promotions (
          promotion_name,
          promotion_code,
          discount_type,
          discount_value,
          free_months,
          first_payment_only
        )
      `)
      .not('promotion_id', 'is', null)
      .eq('status', 'success')
      .order('approved_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // pending_user_promotions에서 소스 정보 가져오기
    if (data && data.length > 0) {
      const paymentIds = data.map(p => p.payment_id);
      const { data: pendingData } = await supabase
        .from('pending_user_promotions')
        .select('payment_id, source')
        .in('payment_id', paymentIds)
        .eq('status', 'applied');

      const sourceMap = {};
      if (pendingData) {
        pendingData.forEach(p => {
          sourceMap[p.payment_id] = p.source;
        });
      }

      data.forEach(payment => {
        payment.source = sourceMap[payment.payment_id] || 'unknown';
        // billing_payments가 source of truth이므로 payment 객체를 중첩
        payment.billing_payments = {
          payment_id: payment.payment_id,
          approved_at: payment.approved_at,
          amount: payment.amount,
          status: payment.status
        };
      });
    }

    res.json({ success: true, history: data || [] });
  } catch (error) {
    console.error('프로모션 적용 이력 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 회원별 프로모션 적용 상세 이력
router.get('/api/users/:userId/promotion-applied-detail', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // 결제 이력 (프로모션 적용된 것만)
    const { data: payments, error: paymentsError } = await supabase
      .from('billing_payments')
      .select(`
        *,
        subscription_promotions (
          promotion_name,
          promotion_code,
          discount_type,
          discount_value,
          free_months
        ),
        user_subscriptions (
          subscription_plans (
            plan_name,
            price,
            period_months
          )
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'success')
      .order('created_at', { ascending: false });

    if (paymentsError) throw paymentsError;

    // 현재 구독 정보
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (
          plan_name,
          price,
          period_months
        )
      `)
      .eq('user_id', userId)
      .single();

    // 다음 결제 예정 금액 계산
    let nextPaymentAmount = null;
    if (subscription && subscription.status === 'active') {
      nextPaymentAmount = subscription.subscription_plans?.price || 0;
      
      // 다음 결제에 적용될 프로모션 확인
      const { data: nextPromotion } = await supabase
        .from('pending_user_promotions')
        .select(`
          *,
          subscription_promotions (
            discount_type,
            discount_value,
            free_months
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'reserved')
        .is('applied_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (nextPromotion) {
        const promo = nextPromotion.subscription_promotions;
        if (promo.discount_type === 'free') {
          nextPaymentAmount = 0;
        } else if (promo.discount_type === 'percent') {
          nextPaymentAmount = Math.round(nextPaymentAmount * (1 - promo.discount_value / 100));
        } else if (promo.discount_type === 'amount') {
          nextPaymentAmount = Math.max(0, nextPaymentAmount - promo.discount_value);
        }
      }
    }

    res.json({
      success: true,
      payments: payments || [],
      current_subscription: subscription || null,
      next_payment_amount: nextPaymentAmount
    });
  } catch (error) {
    console.error('회원 프로모션 적용 상세 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 할당 (개별 또는 전체)
router.post('/api/assign-promotion', requireAdmin, async (req, res) => {
  try {
    const { promotion_id, user_ids, assign_all } = req.body;

    if (!promotion_id) {
      return res.status(400).json({ error: '프로모션을 선택해주세요.' });
    }

    let targetUserIds = [];

    if (assign_all) {
      // 전체 회원 대상 - 첫 결제 예정 고객만 필터링 (자동결제 고객 제외)
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('user_id')
        .eq('is_deleted', false);

      if (usersError) {
        console.error('전체 회원 조회 오류:', usersError);
        return res.status(500).json({ error: '전체 회원 조회 실패' });
      }

      const allUserIds = allUsers.map(u => u.user_id);
      
      // 결제 내역 조회 (billing_payments)
      const { data: payments } = await supabase
        .from('billing_payments')
        .select('user_id')
        .in('user_id', allUserIds);
      
      // 결제 내역이 있는 회원 user_id 세트
      const paidUserIds = new Set(payments?.map(p => p.user_id) || []);
      
      // 자동결제 중인 고객 조회 (user_subscriptions)
      const { data: subscriptions } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .in('user_id', allUserIds);
      
      const autoBillingUserIds = new Set(subscriptions?.map(s => s.user_id) || []);
      
      // 첫 결제 예정 고객만 필터링 (결제 내역 없음 AND 자동결제 중이 아님)
      targetUserIds = allUserIds.filter(userId => 
        !paidUserIds.has(userId) && !autoBillingUserIds.has(userId)
      );
      
      console.log(`전체 회원 ${allUserIds.length}명 중 첫 결제 예정 고객 ${targetUserIds.length}명에게 할당`);
    } else {
      // 선택한 회원 - 첫 결제 예정 고객만 필터링 (자동결제 고객 제외)
      if (!user_ids || user_ids.length === 0) {
        return res.status(400).json({ error: '할당 대상 회원을 선택해주세요.' });
      }
      
      // 결제 내역 조회 (billing_payments)
      const { data: payments } = await supabase
        .from('billing_payments')
        .select('user_id')
        .in('user_id', user_ids);
      
      // 결제 내역이 있는 회원 user_id 세트
      const paidUserIds = new Set(payments?.map(p => p.user_id) || []);
      
      // 자동결제 중인 고객 조회 (user_subscriptions)
      const { data: subscriptions } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .in('user_id', user_ids);
      
      const autoBillingUserIds = new Set(subscriptions?.map(s => s.user_id) || []);
      
      // 첫 결제 예정 고객만 필터링 (결제 내역 없음 AND 자동결제 중이 아님)
      targetUserIds = user_ids.filter(userId => 
        !paidUserIds.has(userId) && !autoBillingUserIds.has(userId)
      );
      
      const filteredCount = user_ids.length - targetUserIds.length;
      if (filteredCount > 0) {
        console.log(`선택한 회원 ${user_ids.length}명 중 ${filteredCount}명은 이미 결제했거나 자동결제 중이어서 제외됨`);
      }
    }
    
    if (targetUserIds.length === 0) {
      return res.json({
        success: true,
        message: '첫 결제 예정 고객이 없습니다. 프로모션은 첫 결제 전 고객에게만 할당됩니다.',
        assigned: 0
      });
    }

    // pending_user_promotions에 INSERT (중복 무시)
    const insertData = targetUserIds.map(user_id => ({
      user_id,
      promotion_id,
      source: 'admin_assigned'
    }));

    const { data, error } = await supabase
      .from('pending_user_promotions')
      .insert(insertData)
      .select();

    if (error) {
      // 중복 오류는 무시 (UNIQUE 제약)
      if (error.code === '23505') {
        return res.json({ 
          success: true, 
          message: '일부 회원은 이미 해당 프로모션이 할당되어 있습니다.',
          assigned: data?.length || 0
        });
      }
      console.error('프로모션 할당 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ 
      success: true, 
      message: `${data.length}명의 회원에게 프로모션이 할당되었습니다.`,
      assigned: data.length
    });
  } catch (error) {
    console.error('프로모션 할당 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 할당 내역 조회
// 예약 관리 조회 (아직 적용되지 않은 것만)
router.get('/api/assign-promotion/assignments', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pending_user_promotions')
      .select(`
        *,
        users (
          pharmacist_name,
          pharmacy_name,
          pharmacist_phone,
          business_number,
          user_id
        ),
        subscription_promotions (
          promotion_name,
          promotion_code,
          discount_type,
          discount_value,
          free_months
        )
      `)
      .is('applied_at', null)  // ✅ 아직 적용되지 않은 예약만
      .order('created_at', { ascending: false });

    if (error) {
      console.error('할당 내역 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }
    
    // 이메일 정보 추가 (auth.users에서 조회)
    if (data && data.length > 0) {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (!authError && authUsers) {
        const emailMap = {};
        authUsers.users.forEach(au => {
          emailMap[au.id] = au.email;
        });
        
        data.forEach(assignment => {
          if (assignment.users) {
            assignment.users.email = emailMap[assignment.user_id] || null;
          }
        });
      }
    }

    res.json({ success: true, assignments: data });
  } catch (error) {
    console.error('할당 내역 조회 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 회원 검색 API (약사명, 약국명으로 검색)
router.get('/api/assign-promotion/search-users', requireAdmin, async (req, res) => {
  try {
    const { pharmacist_name, pharmacy_name } = req.query;
    
    let query = supabase
      .from('users')
      .select(`
        user_id,
        pharmacist_name,
        pharmacy_name,
        pharmacist_phone,
        business_number,
        business_number
      `)
      .eq('is_deleted', false);
    
    if (pharmacist_name) {
      query = query.ilike('pharmacist_name', `%${pharmacist_name}%`);
    }
    
    if (pharmacy_name) {
      query = query.ilike('pharmacy_name', `%${pharmacy_name}%`);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    
    if (error) {
      console.error('회원 검색 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }
    
    // 추가 정보 조회
    if (data && data.length > 0) {
      const userIds = data.map(u => u.user_id);
      const businessNumbers = data.map(u => u.business_number).filter(Boolean);
      
      // 1. 이메일 정보 (auth.users)
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      const emailMap = {};
      if (!authError && authUsers) {
        authUsers.users.forEach(au => {
          emailMap[au.id] = au.email;
        });
      }
      
      // 2. 프로모션 사용 이력 (promotion_usage_history)
      const { data: usageHistory } = await supabase
        .from('promotion_usage_history')
        .select('business_number, promotion_id, last_applied_at')
        .in('business_number', businessNumbers);
      
      const usageMap = {};
      if (usageHistory) {
        usageHistory.forEach(h => {
          if (!usageMap[h.business_number]) {
            usageMap[h.business_number] = [];
          }
          usageMap[h.business_number].push(h);
        });
      }
      
      // 3. 구독 정보 (user_subscriptions)
      const { data: subscriptions } = await supabase
        .from('user_subscriptions')
        .select('user_id, status, subscription_id')
        .in('user_id', userIds);
      
      const subscriptionMap = {};
      if (subscriptions) {
        subscriptions.forEach(sub => {
          subscriptionMap[sub.user_id] = sub;
        });
      }
      
      // 4. 결제 횟수 (billing_payments) - 첫 결제 예정 고객만 필터링
      const { data: payments } = await supabase
        .from('billing_payments')
        .select('user_id, payment_id, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: true });
      
      const paymentCountMap = {};
      if (payments) {
        payments.forEach(payment => {
          if (!paymentCountMap[payment.user_id]) {
            paymentCountMap[payment.user_id] = 0;
          }
          paymentCountMap[payment.user_id]++;
        });
      }
      
      // 데이터 매핑 및 첫 결제 예정 고객만 필터링 (자동결제 중인 고객 제외)
      const filteredData = [];
      data.forEach(user => {
        const paymentCount = paymentCountMap[user.user_id] || 0;
        const subscription = subscriptionMap[user.user_id] || null;
        const isAutoBilling = subscription && subscription.status === 'active';
        
        // 첫 결제 예정 고객만 포함 (payment_count = 0 AND 자동결제 중이 아님)
        if (paymentCount > 0 || isAutoBilling) {
          return; // 이미 결제했거나 자동결제 중인 고객은 제외
        }
        
        user.email = emailMap[user.user_id] || null;
        user.promotion_history = usageMap[user.business_number] || [];
        user.has_promotion_history = (user.promotion_history.length > 0);
        user.subscription = subscription;
        user.is_auto_billing = isAutoBilling;
        user.payment_count = paymentCount;
        user.payment_status = '미결제 (첫 결제 예정)';
        
        filteredData.push(user);
      });
      
      return res.json({ success: true, users: filteredData });
    }
    
    res.json({ success: true, users: data });
  } catch (error) {
    console.error('회원 검색 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

// 프로모션 할당 취소 (아직 적용되지 않은 것만)
router.delete('/api/assign-promotion/:pendingId', requireAdmin, async (req, res) => {
  try {
    const { pendingId } = req.params;

    // applied_at이 NULL인 것만 삭제 가능
    const { data: pending } = await supabase
      .from('pending_user_promotions')
      .select('applied_at')
      .eq('pending_id', pendingId)
      .single();

    if (pending && pending.applied_at) {
      return res.status(400).json({ 
        error: '이미 적용된 프로모션은 취소할 수 없습니다.' 
      });
    }

    const { error } = await supabase
      .from('pending_user_promotions')
      .delete()
      .eq('pending_id', pendingId);

    if (error) {
      console.error('할당 취소 오류:', error);
      return res.status(500).json({ error: '서버 오류' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('할당 취소 오류:', error);
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
