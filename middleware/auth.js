const supabase = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase Auth Bearer Token 검증 미들웨어
 * Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
 * 검증 성공 시 req.user에 사용자 정보를, req.supabase에 인증된 클라이언트를 저장합니다.
 */
async function requireAuth(req, res, next) {
  try {
    let token = null;
    
    // 1. Authorization 헤더에서 토큰 추출 (API 호출)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 2. 쿼리 파라미터에서 토큰 추출 (토스 리다이렉트)
    if (!token && req.query.access_token) {
      token = req.query.access_token;
      console.log('✅ 쿼리 파라미터에서 access_token 추출');
    }
    
    // 3. 쿠키에서 토큰 추출 (브라우저 리다이렉트 - Supabase 자동 쿠키)
    if (!token && req.cookies) {
      // 모든 쿠키 로깅 (디버깅용)
      console.log('🍪 전체 쿠키 목록:', Object.keys(req.cookies));
      
      // Supabase 쿠키 패턴들을 시도
      const cookiePatterns = [
        'sb-gitbtujexmsjfixgeoha-auth-token',
        'sb-gitbtujexmsjfixgeoha-auth-token-code-verifier',
        'supabase-auth-token',
        'sb-access-token',
        'sb-refresh-token'
      ];
      
      let cookieValue = null;
      let usedCookieName = null;
      
      for (const pattern of cookiePatterns) {
        if (req.cookies[pattern]) {
          cookieValue = req.cookies[pattern];
          usedCookieName = pattern;
          console.log(`✅ 쿠키 발견: ${pattern}`);
          break;
        }
      }
      
      // 패턴으로 찾지 못하면 sb-로 시작하는 모든 쿠키 확인
      if (!cookieValue) {
        const allSupabaseCookies = Object.keys(req.cookies).filter(k => k.startsWith('sb-'));
        console.log('🔍 Supabase 관련 쿠키:', allSupabaseCookies);
        
        // base64 인코딩된 토큰을 포함하는 쿠키 찾기
        for (const key of allSupabaseCookies) {
          const value = req.cookies[key];
          if (value && (value.includes('eyJ') || value.startsWith('['))) {
            cookieValue = value;
            usedCookieName = key;
            console.log(`✅ Base64 토큰 발견: ${key}`);
            break;
          }
        }
      }
      
      if (cookieValue) {
        try {
          // URL 디코딩 시도
          let decodedValue = decodeURIComponent(cookieValue);
          
          // JSON 배열 형식인 경우: ["access_token", "refresh_token"]
          if (decodedValue.startsWith('[')) {
            const parsed = JSON.parse(decodedValue);
            token = Array.isArray(parsed) ? parsed[0] : parsed.access_token || parsed;
            console.log(`✅ 쿠키에서 토큰 추출 성공 (${usedCookieName})`);
          } 
          // JSON 객체 형식인 경우: {access_token: "...", refresh_token: "..."}
          else if (decodedValue.startsWith('{')) {
            const parsed = JSON.parse(decodedValue);
            token = parsed.access_token || parsed;
            console.log(`✅ 쿠키에서 토큰 추출 성공 (${usedCookieName})`);
          }
          // Base64 인코딩된 JSON
          else if (decodedValue.includes('base64,')) {
            const base64Data = decodedValue.split('base64,')[1];
            const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
            const parsed = JSON.parse(decoded);
            token = parsed.access_token || parsed[0] || parsed;
            console.log(`✅ Base64 디코딩 후 토큰 추출 성공 (${usedCookieName})`);
          }
          // 직접 토큰 문자열
          else if (decodedValue.startsWith('eyJ')) {
            token = decodedValue;
            console.log(`✅ 직접 토큰 사용 (${usedCookieName})`);
          }
        } catch (e) {
          console.error('❌ 쿠키 파싱 실패:', e.message);
          console.error('   쿠키 값:', cookieValue.substring(0, 100) + '...');
        }
      } else {
        console.log('❌ Supabase 인증 쿠키를 찾을 수 없습니다.');
      }
    }
    
    if (!token) {
      // HTML 페이지 요청인 경우 로그인 페이지로 리다이렉트 (원래 URL 저장)
      if (req.accepts('html')) {
        const returnTo = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login?returnTo=${returnTo}`);
      }
      // API 요청인 경우 JSON 응답
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다.'
      });
    }
    
    // Supabase에서 토큰 검증
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('토큰 검증 실패:', error);
      // HTML 페이지 요청인 경우 로그인 페이지로 리다이렉트
      if (req.accepts('html')) {
        const returnTo = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login?returnTo=${returnTo}`);
      }
      // API 요청인 경우 JSON 응답
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      });
    }
    
    // req.user에 사용자 정보 저장
    req.user = user;
    req.accessToken = token;
    
    // 사용자의 access_token으로 인증된 Supabase 클라이언트 생성
    // 이 클라이언트를 사용하면 RLS 정책이 auth.uid()를 올바르게 인식함
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
    
    next();
  } catch (error) {
    console.error('인증 미들웨어 오류:', error);
    return res.status(500).json({
      success: false,
      message: '인증 처리 중 오류가 발생했습니다.'
    });
  }
}

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없으면 통과)
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user) {
        req.user = user;
        req.accessToken = token;
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
      }
    }
    
    next();
  } catch (error) {
    // 에러가 있어도 계속 진행
    next();
  }
}

module.exports = {
  requireAuth,
  optionalAuth
};
