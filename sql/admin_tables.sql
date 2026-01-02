-- ================================================
-- 관리자 시스템 테이블
-- ================================================

-- 1. 관리자 계정 테이블
CREATE TABLE admins (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email VARCHAR(255) UNIQUE NOT NULL,
  admin_password_hash TEXT NOT NULL,  -- bcrypt 해시
  admin_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'operator',  -- 'super_admin', 'admin', 'operator'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES admins(admin_id),  -- 누가 생성했는지
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admins IS '관리자 계정 테이블';
COMMENT ON COLUMN admins.role IS 'super_admin: 모든 권한, admin: 대부분 권한, operator: 조회 및 기본 운영';


-- 2. 관리자 세션 테이블 (보안 강화)
CREATE TABLE admin_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,  -- 세션 토큰
  ip_address INET,  -- 접속 IP 기록
  user_agent TEXT,  -- 브라우저 정보
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_sessions IS '관리자 로그인 세션 관리 (보안 추적용)';

CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);


-- 3. 관리자 활동 로그 테이블 (감사 추적)
CREATE TABLE admin_activity_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(admin_id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,  -- 'create_promotion', 'delete_user', 'update_plan' 등
  target_type VARCHAR(50),  -- 'user', 'promotion', 'subscription' 등
  target_id UUID,  -- 대상 ID
  details JSONB,  -- 상세 정보 (변경 전후 값 등)
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_activity_logs IS '관리자 모든 활동 기록 (감사 추적)';

CREATE INDEX idx_admin_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX idx_admin_logs_action_type ON admin_activity_logs(action_type);
CREATE INDEX idx_admin_logs_created_at ON admin_activity_logs(created_at DESC);


-- 4. 초기 슈퍼 관리자 계정 생성 (비밀번호: Admin123! - 반드시 변경 필요)
-- bcrypt 해시: $2b$10$Xg8vZ9QjK5Y3J0XqF2L8Mu7pYUjQZ9wN3D6K8LfX5R9sT4vW1cE2m
INSERT INTO admins (admin_email, admin_password_hash, admin_name, role)
VALUES (
  'admin@pharmchecker.com',
  '$2b$10$Xg8vZ9QjK5Y3J0XqF2L8Mu7pYUjQZ9wN3D6K8LfX5R9sT4vW1cE2m',
  'Super Admin',
  'super_admin'
);

COMMENT ON TABLE admins IS '⚠️ 초기 비밀번호: Admin123! (반드시 최초 로그인 후 변경)';
