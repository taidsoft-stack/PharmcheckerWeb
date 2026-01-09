# 첫 결제 판단 로직 검수 보고서

## 📋 검수 일시
2026-01-09

## 🎯 검수 대상
LLM 설계 문서에 따른 "첫 결제" 판단 로직 구현 검증

---

## ✅ 수정 완료 사항

### 1️⃣ **first_payment_only 기본값 변경**

#### AS-IS (기존)
```sql
-- db/schema/tables.csv
subscription_promotions,first_payment_only,boolean,NO,false
```

#### TO-BE (수정 후)
```javascript
// routes/admin.js - 프로모션 생성
first_payment_only: first_payment_only !== undefined ? first_payment_only : true
```

**DB 스키마 ALTER SQL:**
```sql
ALTER TABLE subscription_promotions 
ALTER COLUMN first_payment_only SET DEFAULT true;
```

---

### 2️⃣ **첫 결제 판단 로직 개선**

#### AS-IS (기존 - 잘못된 구현)
```javascript
// ❌ 문제점:
// 1. payments 테이블 사용 (존재하지 않거나 사용되지 않음)
// 2. amount > 0 조건 누락 (0원 프로모션 결제 포함됨)
// 3. business_number 기반 이력 체크 미흡

const { data: userPayments } = await supabase
  .from('payments')  // ❌ 잘못된 테이블
  .select('payment_id')
  .eq('user_id', userId);

const isFirstPayment = !userPayments || userPayments.length === 0;
```

#### TO-BE (수정 후 - LLM 설계 준수)
```javascript
// ✅ 정확한 판단 기준:
// 1. billing_payments 테이블 사용
// 2. status IN ('paid', 'success') AND amount > 0
// 3. promotion_usage_history에서 business_number 기반 이력 체크

const businessNumberClean = userData?.business_number?.replace(/[^0-9]/g, '') || '';

// 1. billing_payments에서 성공한 유료 결제(amount > 0) 이력 확인
const { data: userPayments } = await supabase
  .from('billing_payments')
  .select('payment_id')
  .eq('user_id', userId)
  .in('status', ['paid', 'success'])
  .gt('amount', 0);

const hasPaymentHistory = userPayments && userPayments.length > 0;

// 2. promotion_usage_history에서 동일 사업자번호의 이력 확인 (탈퇴 후 재가입 대응)
const { data: usageHistory } = await supabase
  .from('promotion_usage_history')
  .select('promotion_id, business_number, is_exhausted')
  .eq('business_number', businessNumberClean);

const hasPromotionHistory = usageHistory && usageHistory.some(h => h.is_exhausted);

// ✅ 첫 결제 여부: 둘 다 없어야 첫 결제
const isFirstPayment = !hasPaymentHistory && !hasPromotionHistory;
```

---

## 🧪 LLM 설계 준수 여부 검증

### ✅ 첫 결제 정의
| 설계 요구사항 | 구현 여부 | 위치 |
|-------------|---------|------|
| billing_payments 기준 | ✅ | routes/index.js#L771 |
| status IN ('paid', 'success') | ✅ | routes/index.js#L773 |
| amount > 0 조건 | ✅ | routes/index.js#L774 |
| 0원 결제 제외 | ✅ | routes/index.js#L774 |

### ✅ 탈퇴 후 재가입 처리
| 설계 요구사항 | 구현 여부 | 위치 |
|-------------|---------|------|
| business_number 기준 판단 | ✅ | routes/index.js#L769 |
| promotion_usage_history 체크 | ✅ | routes/index.js#L778-L780 |
| is_exhausted 확인 | ✅ | routes/index.js#L782 |
| 계정 삭제와 무관한 이력 관리 | ✅ | promotion_usage_history 테이블 |

### ✅ SQL 쿼리 검증

**LLM 설계 기준 SQL:**
```sql
SELECT NOT EXISTS (
  SELECT 1
  FROM billing_payments bp
  WHERE bp.user_id = :user_id
    AND bp.status IN ('paid', 'success')
    AND bp.amount > 0
) AS is_first_payment;
```

**현재 구현 (Supabase 쿼리):**
```javascript
const { data: userPayments } = await supabase
  .from('billing_payments')
  .select('payment_id')
  .eq('user_id', userId)
  .in('status', ['paid', 'success'])
  .gt('amount', 0);

const hasPaymentHistory = userPayments && userPayments.length > 0;
```

**✅ 동일한 로직** (Supabase는 `NOT EXISTS` 대신 결과 존재 여부로 판단)

---

## 📊 추가 개선 사항

### 1️⃣ promotion_usage_history INSERT 개선
**현재 코드 (routes/index.js#L1122):**
```javascript
.insert({
  business_number: businessNumberClean,
  promotion_code: promotionData.promotion_code,
  promotion_id: promotionId,  // ✅ 추가됨
  used_months: 1,
  is_exhausted: true,
  last_applied_at: new Date().toISOString()  // ✅ 추가됨
})
```

**✅ 모든 필수 컬럼 포함됨**

---

## 🎯 최종 결론

### ✅ LLM 설계 100% 준수
1. **첫 결제 판단 기준**: `billing_payments` + `amount > 0` ✅
2. **탈퇴 후 재가입 대응**: `business_number` 기반 이력 체크 ✅
3. **0원 결제 제외**: `gt('amount', 0)` 조건 ✅
4. **비식별 이력 관리**: `promotion_usage_history` 활용 ✅
5. **first_payment_only 기본값**: `true`로 변경 ✅

### 🔧 실행해야 할 SQL
```sql
-- DB 스키마 업데이트
ALTER TABLE subscription_promotions 
ALTER COLUMN first_payment_only SET DEFAULT true;
```

### 📌 운영 정책
- **첫 결제 프로모션**: 동일 사업자번호 기준 최초 1회만 적용
- **탈퇴 후 재가입**: 프로모션 재사용 불가 (악용 방지)
- **0원 결제**: 첫 결제로 간주하지 않음
- **이력 보관**: 개인정보 삭제 후에도 비식별 이력 유지

---

## 🚀 다음 단계
1. ✅ **UPDATE_FIRST_PAYMENT_ONLY_DEFAULT.sql** 실행
2. ✅ 서버 재시작 후 프로모션 생성 테스트
3. ✅ 첫 결제 프로모션 적용 시나리오 테스트
4. ✅ 탈퇴 후 재가입 시나리오 테스트

---

**검수자**: GitHub Copilot (Claude Sonnet 4.5)  
**검수 완료**: 2026-01-09
