-- ===========================================
-- 테스트 데이터 초기화 쿼리 (재테스트용)
-- ===========================================
-- 📝 사용법: 아래 3곳의 값만 변경 후 실행
-- - test_email: 테스트 계정 이메일
-- - test_business_number: 테스트 사업자번호 (숫자만)

DO $$
DECLARE
  test_email TEXT := 'your-test-email@example.com';  -- 📝 변경 필요
  test_business_number TEXT := '1234567890';  -- 📝 변경 필요 (숫자만)
  target_user_id UUID;
  deleted_count INT;
BEGIN
  -- 1. 테스트 계정의 user_id 조회
  SELECT u.user_id INTO target_user_id
  FROM public.users u
  INNER JOIN auth.users au ON u.user_id = au.id
  WHERE au.email = test_email;

  IF target_user_id IS NULL THEN
    RAISE NOTICE '⚠️ 해당 이메일의 사용자를 찾을 수 없습니다: %', test_email;
    RETURN;
  END IF;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎯 삭제 대상: % (user_id: %)', test_email, target_user_id;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- 2. billing_payments 삭제
  DELETE FROM billing_payments WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ billing_payments 삭제: %건', deleted_count;

  -- 3. subscription_free_grants 삭제
  DELETE FROM subscription_free_grants WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ subscription_free_grants 삭제: %건', deleted_count;

  -- 4. user_subscriptions 삭제 (⚠️ payment_methods보다 먼저!)
  DELETE FROM user_subscriptions WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ user_subscriptions 삭제: %건', deleted_count;

  -- 5. payment_methods 삭제 (user_subscriptions 삭제 후)
  DELETE FROM payment_methods WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ payment_methods 삭제: %건', deleted_count;

  -- 6. pending_user_promotions 삭제 (또는 applied_at 리셋)
  -- 옵션 A: 완전 삭제
  DELETE FROM pending_user_promotions WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ pending_user_promotions 삭제: %건', deleted_count;
  
  -- 옵션 B: applied_at만 리셋 (재사용하려면 주석 해제)
  -- UPDATE pending_user_promotions 
  -- SET applied_at = NULL 
  -- WHERE user_id = target_user_id;

  -- 7. promotion_usage_history 삭제 (사업자번호 기반)
  DELETE FROM promotion_usage_history WHERE business_number = test_business_number;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ promotion_usage_history 삭제: %건', deleted_count;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎉 모든 테스트 데이터 삭제 완료!';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- ===========================================
-- 삭제 확인 쿼리 (삭제 후 실행)
-- ===========================================

-- 남은 데이터 확인
SELECT 
  'billing_payments' as table_name, 
  COUNT(*) as remaining_count
FROM billing_payments bp
INNER JOIN auth.users au ON bp.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL
SELECT 'payment_methods', COUNT(*)
FROM payment_methods pm
INNER JOIN auth.users au ON pm.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL
SELECT 'subscription_free_grants', COUNT(*)
FROM subscription_free_grants sfg
INNER JOIN auth.users au ON sfg.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL
SELECT 'pending_user_promotions', COUNT(*)
FROM pending_user_promotions pup
INNER JOIN auth.users au ON pup.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL
SELECT 'user_subscriptions', COUNT(*)
FROM user_subscriptions us
INNER JOIN auth.users au ON us.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL
SELECT 'promotion_usage_history', COUNT(*)
FROM promotion_usage_history
WHERE business_number = '1234567890';  -- 📝 변경 필요
