-- user_subscriptions 테이블의 current_period_start/end를 NULL 허용으로 변경
-- 무료 기간에는 결제 주기가 없으므로 NULL이 논리적으로 맞음

ALTER TABLE public.user_subscriptions
ALTER COLUMN current_period_start DROP NOT NULL;

ALTER TABLE public.user_subscriptions
ALTER COLUMN current_period_end DROP NOT NULL;

-- 변경 확인
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_subscriptions'
  AND column_name IN ('current_period_start', 'current_period_end', 'next_billing_at')
ORDER BY ordinal_position;
