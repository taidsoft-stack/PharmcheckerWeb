-- ===========================================
-- 0원 결제 검증 쿼리 (무료 프로모션)
-- ===========================================
-- 📝 사용법: test_email, test_business_number만 변경 후 실행

-- ============================================
-- 1️⃣ user_subscriptions: 구독 생성 확인
-- ============================================
SELECT 
  us.subscription_id,
  us.user_id,
  us.status,
  sp_entry.plan_name as entry_plan_name,
  sp_billing.plan_name as billing_plan_name,
  pr.promotion_name,
  us.current_period_start,
  us.current_period_end,
  us.next_billing_at,
  us.is_first_billing,
  us.created_at,
  CASE 
    WHEN us.current_period_start IS NULL THEN '✅ 무료 기간 (current_period NULL)'
    ELSE '💳 유료 기간'
  END as subscription_type
FROM user_subscriptions us
INNER JOIN auth.users au ON us.user_id = au.id
LEFT JOIN subscription_plans sp_entry ON us.entry_plan_id = sp_entry.plan_id
LEFT JOIN subscription_plans sp_billing ON us.billing_plan_id = sp_billing.plan_id
LEFT JOIN subscription_promotions pr ON us.promotion_id = pr.promotion_id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY us.created_at DESC
LIMIT 1;

-- ============================================
-- 2️⃣ payment_methods: 빌링키 발급 확인
-- ============================================
SELECT 
  pm.payment_method_id,
  pm.user_id,
  pm.billing_key,
  pm.card_company,
  pm.card_last4,
  pm.expires_year,
  pm.expires_month,
  pm.is_default,
  pm.created_at,
  pm.disabled_at
FROM payment_methods pm
INNER JOIN auth.users au ON pm.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY pm.created_at DESC
LIMIT 1;

-- ============================================
-- 3️⃣ billing_payments: 결제 기록 확인 (⚠️ 0원도 기록되어야 함)
-- ============================================
SELECT 
  bp.payment_id,
  bp.subscription_id,
  bp.user_id,
  bp.order_id,
  bp.payment_key,
  bp.billing_key,
  bp.amount,
  bp.currency,
  bp.status,
  bp.payment_method_id,
  bp.requested_at,
  bp.approved_at,
  bp.created_at,
  CASE 
    WHEN bp.amount = 0 AND bp.payment_key IS NULL THEN '✅ 0원 결제 (무료 프로모션)'
    WHEN bp.amount > 0 AND bp.payment_key IS NOT NULL THEN '💳 유료 결제'
    ELSE '⚠️ 비정상 상태'
  END as payment_type
FROM billing_payments bp
INNER JOIN auth.users au ON bp.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY bp.requested_at DESC
LIMIT 1;

-- ============================================
-- 4️⃣ subscription_free_grants: 무료 프로모션 부여 기록 (0원 결제 시만)
-- ============================================
SELECT 
  sfg.free_grant_id,
  sfg.user_id,
  sfg.subscription_id,
  pr.promotion_name,
  rc.code as referral_code,
  sfg.free_months,
  sfg.granted_at,
  sfg.effective_start,
  sfg.effective_end,
  sfg.created_at,
  EXTRACT(DAY FROM (sfg.effective_end - sfg.effective_start)) as total_days
FROM subscription_free_grants sfg
INNER JOIN auth.users au ON sfg.user_id = au.id
LEFT JOIN subscription_promotions pr ON sfg.promotion_id = pr.promotion_id
LEFT JOIN referral_codes rc ON sfg.referral_code_id = rc.referral_code_id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY sfg.created_at DESC
LIMIT 1;

-- ============================================
-- 5️⃣ promotion_usage_history: 사업자번호 기반 프로모션 사용 이력
-- ============================================
SELECT 
  history_id,
  business_number,
  promotion_code,
  first_used_at,
  last_used_at,
  used_months,
  is_exhausted,
  created_at,
  CASE 
    WHEN is_exhausted = true THEN '🔴 소진됨 (재사용 불가)'
    ELSE '🟢 사용 가능'
  END as status
FROM promotion_usage_history
WHERE business_number = '1234567890'  -- 📝 변경 필요 (숫자만)
ORDER BY created_at DESC
LIMIT 1;

-- ============================================
-- 6️⃣ pending_user_promotions: 프로모션 적용 완료 확인
-- ============================================
SELECT 
  pup.pending_id,
  pup.user_id,
  pr.promotion_name,
  pr.promotion_code,
  rc.code as referral_code,
  pup.created_at,
  pup.applied_at,
  CASE 
    WHEN pup.applied_at IS NOT NULL THEN '✅ 적용 완료'
    ELSE '⏳ 대기 중'
  END as status
FROM pending_user_promotions pup
INNER JOIN auth.users au ON pup.user_id = au.id
LEFT JOIN subscription_promotions pr ON pup.promotion_id = pr.promotion_id
LEFT JOIN referral_codes rc ON pup.referral_code_id = rc.referral_code_id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY pup.created_at DESC
LIMIT 1;

-- ============================================
-- 7️⃣ 전체 요약 검증
-- ============================================
SELECT 
  'user_subscriptions' as table_name, 
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END as status
FROM user_subscriptions us
INNER JOIN auth.users au ON us.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요

UNION ALL

SELECT 'payment_methods', COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM payment_methods pm
INNER JOIN auth.users au ON pm.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'

UNION ALL

SELECT 'billing_payments', COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌ 0원 결제도 기록해야 함!' END
FROM billing_payments bp
INNER JOIN auth.users au ON bp.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'

UNION ALL

SELECT 'subscription_free_grants', COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ 무료 프로모션' ELSE 'ℹ️ 유료 결제' END
FROM subscription_free_grants sfg
INNER JOIN auth.users au ON sfg.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'

UNION ALL

SELECT 'promotion_usage_history', COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM promotion_usage_history
WHERE business_number = '1234567890';  -- 📝 변경 필요

-- ============================================
-- 8️⃣ 0원 결제 상세 검증 (중요!)
-- ============================================
SELECT 
  '0원 결제 검증' as check_name,
  CASE 
    WHEN bp.amount = 0 AND bp.payment_key IS NULL THEN '✅ 정상 (amount=0, payment_key=NULL)'
    WHEN bp.amount = 0 AND bp.payment_key IS NOT NULL THEN '⚠️ 비정상 (0원인데 payment_key 존재)'
    WHEN bp.amount > 0 THEN '💳 유료 결제'
    ELSE '❌ 데이터 없음'
  END as result,
  bp.amount,
  bp.payment_key,
  bp.status
FROM billing_payments bp
INNER JOIN auth.users au ON bp.user_id = au.id
WHERE au.email = 'taidsoft@gmail.com'  -- 📝 변경 필요
ORDER BY bp.requested_at DESC
LIMIT 1;
