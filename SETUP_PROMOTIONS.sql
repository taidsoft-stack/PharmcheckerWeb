-- ========================================
-- PharmChecker 프로모션 & 추천인 코드 초기 데이터
-- ========================================

-- 1️⃣ 1개월 무료 프로모션 생성
INSERT INTO public.subscription_promotions (
  promotion_id,
  promotion_code,
  promotion_name,
  discount_type,
  discount_value,
  free_months,
  start_at,
  end_at,
  is_active,
  created_at
) VALUES (
  gen_random_uuid(),
  'FREE_1MONTH',
  '영업 프로모션 - 1개월 무료',
  'free',
  NULL,
  1,
  '2026-01-01 00:00:00+09',
  NULL,
  true,
  now()
) ON CONFLICT DO NOTHING;

-- 2️⃣ 추천인 코드 생성 (영업용)
-- promotion_id는 위에서 생성한 UUID를 조회해서 사용
INSERT INTO public.referral_codes (
  referral_code_id,
  code,
  promotion_id,
  description,
  max_uses,
  used_count,
  is_active,
  expires_at,
  created_at
) VALUES (
  gen_random_uuid(),
  'SALES2026',
  (SELECT promotion_id FROM public.subscription_promotions WHERE promotion_code = 'FREE_1MONTH'),
  '2026년 영업용 추천인 코드 (1개월 무료)',
  NULL,  -- 무제한 사용
  0,
  true,
  NULL,  -- 만료 없음
  now()
) ON CONFLICT DO NOTHING;

-- 3️⃣ 추천인 코드 사용 횟수 증가 함수
CREATE OR REPLACE FUNCTION public.increment_referral_code_usage(
  p_referral_code_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.referral_codes
  SET used_count = used_count + 1
  WHERE referral_code_id = p_referral_code_id
    AND is_active = true
    AND (max_uses IS NULL OR used_count < max_uses)
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING 1 INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

-- 4️⃣ 검증 쿼리
SELECT 
  rc.code,
  rc.description,
  rc.used_count,
  sp.promotion_name,
  sp.discount_type,
  sp.free_months
FROM public.referral_codes rc
JOIN public.subscription_promotions sp ON rc.promotion_id = sp.promotion_id
WHERE rc.is_active = true;
