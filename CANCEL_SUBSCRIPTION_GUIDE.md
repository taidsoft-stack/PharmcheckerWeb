# 구독 해지 확인 가이드

## 📋 변경되는 테이블 및 컬럼

### 1️⃣ **user_subscriptions** 테이블

#### 해지 예약 시 (사용자가 "구독 해지" 버튼 클릭)
| 컬럼명 | 변경 전 | 변경 후 | 설명 |
|--------|---------|---------|------|
| `cancel_at_period_end` | `false` | `true` | 해지 예약 플래그 |

#### 스케줄러 실행 후 (청구기간 종료일 도래)
| 컬럼명 | 변경 전 | 변경 후 | 설명 |
|--------|---------|---------|------|
| `status` | `active` | `cancelled` | 구독 상태 |
| `canceled_at` | `NULL` | `2026-01-02T10:30:00.000Z` | 실제 해지 시각 (ISO 8601) |
| `updated_at` | (이전 시각) | (현재 시각) | 마지막 업데이트 시각 |

---

## 🔍 확인용 SQL 쿼리

### 1. 해지 예약된 구독 확인
```sql
-- 해지 예약 상태 확인 (cancel_at_period_end = true)
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
FROM user_subscriptions
WHERE cancel_at_period_end = true
ORDER BY current_period_end DESC;
```

### 2. 실제 해지된 구독 확인
```sql
-- 해지 완료된 구독 확인 (status = 'cancelled')
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,
  canceled_at,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
FROM user_subscriptions
WHERE status = 'cancelled'
ORDER BY canceled_at DESC;
```

### 3. 특정 사용자의 구독 상태 확인
```sql
-- 사용자 ID로 구독 상태 확인 (user_id 값을 실제 UUID로 변경)
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,
  canceled_at,
  current_period_start,
  current_period_end,
  billing_plan_id,
  created_at,
  updated_at
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID_HERE'
ORDER BY created_at DESC;
```

### 4. 해지 예약 후 청구기간 종료일 확인
```sql
-- 해지 예약되고 청구기간이 곧 끝나는 구독 확인
SELECT 
  subscription_id,
  user_id,
  status,
  cancel_at_period_end,
  current_period_end,
  DATE(current_period_end) as 종료일,
  CASE 
    WHEN current_period_end < NOW() THEN '처리 대기 중'
    ELSE CONCAT(DATEDIFF(current_period_end, NOW()), '일 남음')
  END as 남은_기간
FROM user_subscriptions
WHERE cancel_at_period_end = true
ORDER BY current_period_end ASC;
```

### 5. 전체 구독 상태 요약
```sql
-- 구독 상태별 통계
SELECT 
  status,
  cancel_at_period_end,
  COUNT(*) as 구독수,
  COUNT(CASE WHEN cancel_at_period_end = true THEN 1 END) as 해지예약수
FROM user_subscriptions
GROUP BY status, cancel_at_period_end
ORDER BY status;
```

---

## 🧪 테스트 시나리오

### 해지 전 상태 확인
```sql
-- 1. 해지 전 구독 상태
SELECT 
  subscription_id,
  user_id,
  status,                      -- 'active'
  cancel_at_period_end,        -- false
  canceled_at,                 -- NULL
  current_period_end
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

### 해지 예약 후 확인
```sql
-- 2. 해지 버튼 클릭 후 (cancel_at_period_end = true로 변경됨)
SELECT 
  subscription_id,
  user_id,
  status,                      -- 여전히 'active'
  cancel_at_period_end,        -- true ✅
  canceled_at,                 -- 여전히 NULL
  current_period_end           -- 이 날짜까지 서비스 이용 가능
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

### 스케줄러 실행 후 확인
```sql
-- 3. 스케줄러 실행 후 (청구기간 종료일 지남)
SELECT 
  subscription_id,
  user_id,
  status,                      -- 'cancelled' ✅
  cancel_at_period_end,        -- 여전히 true
  canceled_at,                 -- 해지 처리 시각 ✅
  current_period_end,
  updated_at
FROM user_subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

---

## 📊 관련 테이블 (참고용)

### billing_payments (결제 내역)
- 해지되어도 **기존 결제 내역은 유지**됩니다.
- 새로운 자동결제만 발생하지 않습니다.

```sql
-- 해지된 구독의 결제 내역 확인
SELECT 
  bp.payment_id,
  bp.order_id,
  bp.amount,
  bp.status,
  bp.requested_at,
  bp.approved_at,
  us.status as subscription_status,
  us.canceled_at
FROM billing_payments bp
JOIN user_subscriptions us ON bp.subscription_id = us.subscription_id
WHERE us.status = 'cancelled'
ORDER BY bp.requested_at DESC;
```

### payment_methods (결제수단)
- 해지되어도 **결제수단은 유지**됩니다.
- 재구독 시 동일한 카드 사용 가능합니다.

---

## 🔧 스케줄러 수동 실행 (테스트용)

```bash
# 스케줄러 직접 실행하여 해지 처리 테스트
cd e:\ysy\pharmchecker
node scripts/recurring_billing_scheduler.js
```

**출력 예시:**
```
===== 해지 예약 구독 처리 =====
해지 처리 대상: 1건

구독 해지 처리: user-uuid-here
  구독 ID: sub-uuid-here
  청구기간 종료: 2026-01-01T23:59:59.999Z
  ✅ 해지 완료

해지 처리 완료: 1건
```

---

## ⚠️ 주의사항

1. **즉시 해지 아님**: 해지 버튼 클릭 시 `cancel_at_period_end = true`로만 설정
2. **서비스 계속 이용**: 청구기간 종료일(`current_period_end`)까지 서비스 정상 이용 가능
3. **스케줄러 의존**: 실제 해지는 스케줄러가 매일 새벽 1시에 자동 처리
4. **데이터 보존**: 해지 후에도 구독 기록과 결제 내역은 모두 보존됨

---

## 🎯 빠른 체크리스트

- [ ] 해지 버튼 클릭 → `cancel_at_period_end = true` 확인
- [ ] "해지 예약됨" 상태 표시 확인
- [ ] 청구기간 종료일까지 서비스 이용 가능 확인
- [ ] 스케줄러 실행 → `status = 'cancelled'` 확인
- [ ] `cancelled_at` 시각 기록 확인
- [ ] 자동결제 더 이상 발생하지 않음 확인
