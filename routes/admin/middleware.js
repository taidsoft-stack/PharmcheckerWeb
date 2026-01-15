const supabase = require('../../config/supabase');
const { createClient } = require('@supabase/supabase-js');

// ===== 관리자 인증 미들웨어 (Supabase Auth 기반) =====
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[requireAdmin] Authorization 헤더 없음');
    return res.status(401).json({ error: '인증 필요' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Supabase에서 토큰 검증
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('[requireAdmin] 토큰 검증 실패:', error);
      return res.status(401).json({ error: '유효하지 않은 토큰' });
    }
    
    console.log('[requireAdmin] 사용자 확인:', user.id, user.email);
    
    // 인증된 Supabase 클라이언트 생성 (RLS 적용)
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
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
      console.log('[requireAdmin] 관리자 권한 없음:', adminError?.message || '데이터 없음');
      return res.status(403).json({ error: '관리자 권한 없음' });
    }
    
    console.log('[requireAdmin] 인증 성공:', admin.admin_id, admin.role);
    req.admin = admin;
    req.user = user;
    req.accessToken = token;
    next();
  } catch (error) {
    console.error('[requireAdmin] 인증 오류:', error);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { requireAdmin };
