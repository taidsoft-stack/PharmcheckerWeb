-- ========================================
-- promotion_usage_history 테이블 생성
-- 목적: 사업자번호 기준 무료 혜택 사용 이력 영구 보존
-- ========================================

CREATE TABLE IF NOT EXISTS public.promotion_usage_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_number text NOT NULL,
  -- 사업자번호 (하이픈 제거, 숫자만 저장)
  -- 개인정보 아님, 탈퇴와 무관하게 영구 보존 가능

  promotion_code text NOT NULL,
  -- 프로모션 코드 (예: FREE_2MONTH, REFERRAL_1MONTH 등)

  first_used_at timestamptz NOT NULL DEFAULT now(),
  -- 최초 혜택 적용 시점

  last_used_at timestamptz,
  -- 마지막 혜택 적용/사용 시점

  used_months integer NOT NULL DEFAULT 0,
  -- 사용한 개월 수 (무료 2개월 → 최대 2)

  is_exhausted boolean NOT NULL DEFAULT false,
  -- 혜택 소진 여부 (true면 재사용 불가)

  created_at timestamptz NOT NULL DEFAULT now()
);

-- 테이블 코멘트
COMMENT ON TABLE public.promotion_usage_history IS
'사업자번호 기준 프로모션/무료혜택 사용 이력을 관리하는 영구 보존 테이블 (탈퇴와 무관)';

-- 컬럼 코멘트
COMMENT ON COLUMN public.promotion_usage_history.business_number IS
'사업자번호 (숫자만 저장, 개인정보 아님)';

COMMENT ON COLUMN public.promotion_usage_history.promotion_code IS
'프로모션 코드 (FREE_2MONTH, REFERRAL_1MONTH 등)';

COMMENT ON COLUMN public.promotion_usage_history.used_months IS
'누적 사용 개월 수';

COMMENT ON COLUMN public.promotion_usage_history.is_exhausted IS
'혜택 소진 여부 (true면 재사용 불가)';

-- ========================================
-- 인덱스 생성 (중복 혜택 차단 핵심)
-- ========================================

-- 사업자번호 + 프로모션 코드 unique 제약
CREATE UNIQUE INDEX IF NOT EXISTS ux_promotion_usage_unique
ON public.promotion_usage_history (business_number, promotion_code);

-- 사업자번호 조회 성능 최적화
CREATE INDEX IF NOT EXISTS idx_promotion_usage_business_number
ON public.promotion_usage_history (business_number);

-- 소진 여부 조회 최적화
CREATE INDEX IF NOT EXISTS idx_promotion_usage_exhausted
ON public.promotion_usage_history (is_exhausted)
WHERE is_exhausted = false;

-- ========================================
-- RLS (Row Level Security) 설정
-- ========================================

ALTER TABLE public.promotion_usage_history ENABLE ROW LEVEL SECURITY;

-- 일반 사용자 접근 전면 차단 (이 테이블은 백엔드 전용)
CREATE POLICY "No direct access for users"
ON public.promotion_usage_history
FOR ALL
USING (false);

-- 관리자만 조회/관리 가능
CREATE POLICY "Admin manage promotion usage history"
ON public.promotion_usage_history
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM admins a
    WHERE a.admin_id = auth.uid()
      AND a.is_active = true
  )
);

-- service_role (백엔드/서버 로직) 전용 접근
-- 이 정책은 supabaseAdmin 클라이언트로만 접근 가능
