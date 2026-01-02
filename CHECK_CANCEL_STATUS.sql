-- ========================================
-- 구독 해지 상태 확인 SQL 쿼리
-- ========================================

-- 1. 특정 사용자의 구독 상태 확인 (userId 값을 실제 값으로 변경)
-- 해지 버튼 클릭 후 즉시 실행하여 확인
SELECT 
  subscription_id,
  user_id,
  status,                    -- 'active'여야 함 (해지 예약 시에도 active 유지)
  cancel_at_period_end,      -- true로 변경되어야 함 ✅
  canceled_at,               -- NULL (아직 실제 해지 전)
  current_period_start,
  current_period_end,        -- 이 날짜까지 서비스 이용 가능
  updated_at,                -- 방금 업데이트된 시각으로 변경됨 ✅
  created_at
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID_HERE'  -- 실제 userId로 변경
ORDER BY created_at DESC;

-- 예상 결과 (해지 버튼 클릭 후):
-- status = 'active'
-- cancel_at_period_end = true  ← 이게 변경되어야 함!
-- canceled_at = NULL
-- updated_at = (방금 시각)


-- ========================================
-- 2. 해지 예약된 모든 구독 확인
-- ========================================
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,      -- true
  current_period_end,        -- 종료 예정일
  updated_at,
  DATE(current_period_end) as 종료예정일,
  CASE 
    WHEN current_period_end > NOW() THEN CONCAT(DATEDIFF(DAY, NOW(), current_period_end), '일 남음')
    ELSE '처리 대기 중'
  END as 상태
FROM user_subscriptions
WHERE cancel_at_period_end = true
ORDER BY current_period_end ASC;


-- ========================================
-- 3. 실제 해지된 구독 확인 (스케줄러 실행 후)
-- ========================================
SELECT 
  subscription_id,
  user_id,
  status,                    -- 'cancelled'
  cancel_at_period_end,      -- true
  canceled_at,               -- 해지 처리된 시각
  current_period_end,
  updated_at,
  created_at
FROM user_subscriptions
WHERE status = 'cancelled'
ORDER BY canceled_at DESC;


-- ========================================
-- 4. 전체 구독 상태 요약
-- ========================================
SELECT 
  status as 상태,
  cancel_at_period_end as 해지예약,
  COUNT(*) as 구독수
FROM user_subscriptions
GROUP BY status, cancel_at_period_end
ORDER BY status;


-- ========================================
-- 5. 문제 디버깅용 - 모든 구독 확인
-- ========================================
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,
  canceled_at,
  updated_at,
  current_period_end
FROM user_subscriptions
ORDER BY updated_at DESC
LIMIT 10;


-- ========================================
-- 6. 서버 로그와 함께 확인
-- ========================================
-- 해지 버튼 클릭 시 서버 콘솔에 다음과 같은 로그가 출력되어야 합니다:
-- "구독 해지 예약 완료: {userId}, subscription_id: {subscriptionId}"
--
-- 만약 이 로그가 보이지 않으면:
-- 1. API 호출이 실패했거나
-- 2. userId가 잘못 전달되었거나
-- 3. 구독 정보를 찾지 못한 것입니다.


-- ========================================
-- 7. 해지 테스트 체크리스트
-- ========================================
-- 예상 결과:
| 컬럼 | 값 | 설명 |
|------|-----|------|
| `status` | `'active'` | 아직 활성 상태 |
| `cancel_at_period_end` | `true` | ✅ 해지 예약됨 |
| `canceled_at` | `NULL` | 아직 실제 해지 전 |
| `updated_at` | `2026-01-02T...` | 방금 업데이트됨 |
