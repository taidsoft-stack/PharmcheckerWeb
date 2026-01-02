-- 특정 사용자의 모든 데이터 삭제 (외래키 순서 고려)
-- 사용법: user_id를 원하는 값으로 변경 후 실행

-- 1. billing_payments 삭제
DELETE FROM billing_payments 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 2. subscription_free_grants 삭제
DELETE FROM subscription_free_grants 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 3. usage_billing_period_stats 삭제
DELETE FROM usage_billing_period_stats 
WHERE subscription_id IN (
  SELECT subscription_id FROM user_subscriptions 
  WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876'
);

-- 4. user_subscriptions 삭제
DELETE FROM user_subscriptions 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 5. payment_methods 삭제
DELETE FROM payment_methods 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 6. pending_user_promotions 삭제
DELETE FROM pending_user_promotions 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 7. usage_daily_stats 삭제
DELETE FROM usage_daily_stats 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 8. 마지막으로 users 삭제
DELETE FROM users 
WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';

-- 삭제 확인
SELECT 'users' as table_name, COUNT(*) as remaining FROM users WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876'
UNION ALL
SELECT 'payment_methods', COUNT(*) FROM payment_methods WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876'
UNION ALL
SELECT 'user_subscriptions', COUNT(*) FROM user_subscriptions WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876'
UNION ALL
SELECT 'pending_user_promotions', COUNT(*) FROM pending_user_promotions WHERE user_id = 'f7599f52-4764-40c6-b42c-6c4ebc78d876';
