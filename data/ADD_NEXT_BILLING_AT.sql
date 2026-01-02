-- user_subscriptions 테이블에 next_billing_at 컬럼 추가
-- 무료 기간 종료 시각을 저장하여 첫 유료 결제 시점을 명확히 함

ALTER TABLE public.user_subscriptions
ADD COLUMN next_billing_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.user_subscriptions.next_billing_at
IS '다음 결제 예정 시각. 무료 기간 중에는 무료 종료 시각, 유료 기간 중에는 current_period_end와 동일';

-- 기존 데이터 마이그레이션: 유료 구독은 current_period_end로 설정
UPDATE public.user_subscriptions
SET next_billing_at = current_period_end
WHERE current_period_start IS NOT NULL
  AND current_period_end IS NOT NULL;

-- 무료 프로모션 중인 구독은 promotion_expires_at으로 설정
UPDATE public.user_subscriptions
SET next_billing_at = promotion_expires_at
WHERE promotion_id IS NOT NULL
  AND promotion_expires_at IS NOT NULL
  AND current_period_start IS NOT NULL;
