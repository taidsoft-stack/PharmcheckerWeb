-- ===========================================
-- 사용자 완전 삭제 (회원가입 데이터 포함)
-- ===========================================
-- ⚠️ 주의: public.users까지 삭제됩니다. 다음 로그인 시 재가입 필요
-- 📝 사용법: test_email, test_business_number만 변경 후 실행

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
  RAISE NOTICE '🗑️  완전 삭제 대상: % (user_id: %)', test_email, target_user_id;
  RAISE NOTICE '⚠️  다음 로그인 시 재가입 필요';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- 2. billing_payments 삭제
  DELETE FROM billing_payments WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ billing_payments 삭제: %건', deleted_count;

  -- 3. subscription_free_grants 삭제
  DELETE FROM subscription_free_grants WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ subscription_free_grants 삭제: %건', deleted_count;

  -- 4. user_subscriptions 삭제 (payment_methods보다 먼저)
  DELETE FROM user_subscriptions WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ user_subscriptions 삭제: %건', deleted_count;

  -- 5. payment_methods 삭제
  DELETE FROM payment_methods WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ payment_methods 삭제: %건', deleted_count;

  -- 6. pending_user_promotions 삭제
  DELETE FROM pending_user_promotions WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ pending_user_promotions 삭제: %건', deleted_count;

  -- 7. promotion_usage_history 삭제 (사업자번호 기반)
  DELETE FROM promotion_usage_history WHERE business_number = test_business_number;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ promotion_usage_history 삭제: %건', deleted_count;

  -- 8. public.users 삭제 (⚠️ 회원가입 정보까지 삭제)
  DELETE FROM public.users WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ public.users 삭제: %건', deleted_count;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '🎉 모든 데이터 완전 삭제 완료!';
  RAISE NOTICE 'ℹ️  auth.users는 유지됨 (다음 로그인 시 재가입 플로우)';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- ===========================================
-- 삭제 확인 쿼리 (삭제 후 실행)
-- ===========================================

-- public.users 확인 (0이어야 함)
SELECT 
  'public.users' as table_name,
  COUNT(*) as remaining_count
FROM public.users u
INNER JOIN auth.users au ON u.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL

-- auth.users 확인 (1이어야 함 - 삭제 안 됨)
SELECT 'auth.users', COUNT(*)
FROM auth.users
WHERE email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL

SELECT 'billing_payments', COUNT(*)
FROM billing_payments bp
INNER JOIN auth.users au ON bp.user_id = au.id
WHERE au.email = 'your-test-email@example.com'  -- 📝 변경 필요

UNION ALL

SELECT 'user_subscriptions', COUNT(*)
FROM user_subscriptions us
INNER JOIN auth.users au ON us.user_id = au.id
WHERE au.email = 'your-test-email@example.com';  -- 📝 변경 필요
