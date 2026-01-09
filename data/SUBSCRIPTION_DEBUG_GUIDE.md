# 구독 상태 디버깅 가이드

## 🔍 문제 상황
**증상**: 결제 실패했는데 "구독중"으로 표시됨  
**원인**: `user_subscriptions` INSERT는 성공했지만, `subscription_free_grants` INSERT 실패 → 트랜잭션 롤백 없음

## 📋 DB 검증 절차

### 1️⃣ Supabase 대시보드 접속
```
1. https://supabase.com 로그인
2. 프로젝트 선택
3. 왼쪽 메뉴 > SQL Editor 클릭
```

### 2️⃣ 특정 사용자 상태 확인
```sql
-- DEBUG_SUBSCRIPTION_STATUS.sql 파일의 1️⃣번 쿼리 실행
-- 결과 확인:
-- - status: 'active' / 'failed' / 'canceled'
-- - created_at: 구독 생성 시각
-- - next_billing_at: 다음 결제 예정일
```

### 3️⃣ 결제 이력 확인
```sql
-- 2️⃣번 쿼리 실행
-- 확인 사항:
-- - status = 'success' 인 결제가 있는지?
-- - status = 'failed' 인 결제만 있는지?
-- - amount = 0 인 무료 결제가 있는지?
```

### 4️⃣ 문제 진단
```sql
-- 6️⃣번 쿼리 실행
-- 결과:
-- - success_count = 0 이면 → 문제 있는 구독
-- - failed_count > 0 이면 → 결제 실패했지만 구독은 active
```

## 🔧 문제 해결 방법

### 방법 1: 잘못된 구독 삭제 (권장)
```sql
-- Step 1: 삭제 대상 확인
SELECT 
    us.subscription_id,
    us.user_id,
    u.pharmacist_name,
    us.status,
    us.created_at
FROM user_subscriptions us
JOIN users u ON us.user_id = u.user_id
WHERE us.user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
  AND us.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM billing_payments bp 
    WHERE bp.subscription_id = us.subscription_id 
      AND bp.status = 'success'
  );

-- Step 2: 확인 후 삭제 실행
DELETE FROM user_subscriptions
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
  AND status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM billing_payments bp 
    WHERE bp.subscription_id = user_subscriptions.subscription_id 
      AND bp.status = 'success'
  );
```

### 방법 2: 구독 상태를 failed로 변경
```sql
UPDATE user_subscriptions
SET 
    status = 'failed',
    failed_at = NOW(),
    updated_at = NOW()
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
  AND status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM billing_payments bp 
    WHERE bp.subscription_id = user_subscriptions.subscription_id 
      AND bp.status = 'success'
  );
```

## 📊 전체 쿼리 실행 순서

### 단계별 가이드
```
1. DEBUG_SUBSCRIPTION_STATUS.sql 파일 열기
2. 1️⃣번 쿼리 복사 → SQL Editor에 붙여넣기 → Run
   → 현재 구독 상태 확인
   
3. 2️⃣번 쿼리 실행
   → 결제 이력 확인 (성공/실패 개수)
   
4. 3️⃣번 쿼리 실행
   → 무료 프로모션 부여 이력 (subscription_free_grants)
   
5. 4️⃣번 쿼리 실행
   → 프로모션 예약 상태 (pending_user_promotions)
   
6. 5️⃣번 쿼리 실행
   → 결제 수단 확인
   
7. 6️⃣번 쿼리 실행
   → ⚠️ 문제 진단 (active인데 성공 결제 없음)
   
8. 7️⃣번 쿼리 실행
   → 🔧 문제 해결 (삭제 대상 확인 후 삭제)
```

## 🎯 특정 사용자 ID로 테스트

### 현재 문제 사용자
```sql
-- user_id: d6396d31-2f7a-49f1-a541-2226a175d0b9

-- ✅ 단계 1: 현재 상태
SELECT * FROM user_subscriptions 
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9';

-- ✅ 단계 2: 결제 이력
SELECT * FROM billing_payments 
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
ORDER BY created_at DESC;

-- ✅ 단계 3: 무료 프로모션
SELECT * FROM subscription_free_grants 
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9';

-- ⚠️ 예상 결과:
-- - user_subscriptions: status='active' 존재
-- - billing_payments: 0건 또는 failed만 존재
-- - subscription_free_grants: 0건 (INSERT 실패로 인해)
```

## 🐛 근본 원인 및 해결

### 문제 코드 (routes/index.js)
```javascript
// Line 1088: user_subscriptions INSERT (성공)
await supabase.from('user_subscriptions').insert(subscriptionData);

// Line 1107: subscription_free_grants INSERT (실패)
// ❌ referral_code_id = "null" (문자열) → UUID 타입 에러
await supabase.from('subscription_free_grants').insert({
  referral_code_id: referralCodeId || null  // ❌ "null" 문자열이 들어감
});
```

### 수정된 코드
```javascript
// Line 861: referralCodeId 정규화 추가
const normalizedReferralCodeId = 
  (referralCodeId === 'null' || referralCodeId === 'undefined' || !referralCodeId) 
  ? null : referralCodeId;

// Line 1114: 정규화된 값 사용
referral_code_id: normalizedReferralCodeId  // ✅ null (실제 NULL)
```

## 📝 체크리스트

### 문제 발생 시 확인 사항
- [ ] user_subscriptions에 status='active' 구독이 있는가?
- [ ] billing_payments에 status='success' 결제가 있는가?
- [ ] subscription_free_grants에 레코드가 있는가?
- [ ] pending_user_promotions에 status='applied' 레코드가 있는가?

### 정상 동작 시 예상 데이터
```
✅ user_subscriptions: status='active', created_at=결제시각
✅ billing_payments: status='success', amount=0 (무료) 또는 18900 (유료)
✅ subscription_free_grants: free_months=1, effective_start~end 설정
✅ pending_user_promotions: status='applied', applied_at=결제시각
✅ payment_methods: billing_key 저장, is_default=true
```

## 🚨 긴급 조치

### 현재 사용자 구독 삭제 (재가입 가능하도록)
```sql
-- ⚠️ 신중하게 실행!
DELETE FROM user_subscriptions
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
  AND subscription_id IN (
    SELECT us.subscription_id
    FROM user_subscriptions us
    WHERE us.user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9'
      AND NOT EXISTS (
        SELECT 1 FROM billing_payments bp
        WHERE bp.subscription_id = us.subscription_id
          AND bp.status = 'success'
      )
  );

-- 결과 확인
SELECT COUNT(*) FROM user_subscriptions 
WHERE user_id = 'd6396d31-2f7a-49f1-a541-2226a175d0b9';
-- 0이면 재가입 가능
```

## 📖 참고 테이블 관계

```
users (user_id)
  ├─ user_subscriptions (구독 상태)
  │   ├─ subscription_id → billing_payments (결제 이력)
  │   └─ subscription_id → subscription_free_grants (무료 부여)
  │
  ├─ pending_user_promotions (프로모션 예약)
  │   └─ payment_id → billing_payments
  │
  └─ payment_methods (결제 수단)
      └─ billing_key → billing_payments
```
