-- ========================================
-- users 테이블에 is_returning_customer 컬럼 추가
-- ========================================
-- 목적: 회원가입 시 재가입 여부를 저장하여 성능 향상

-- 1️⃣ is_returning_customer 컬럼 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_returning_customer boolean DEFAULT false;

COMMENT ON COLUMN users.is_returning_customer IS '재가입 여부 (사업자번호 기준으로 과거 결제 또는 프로모션 사용 이력이 있으면 true)';

-- 2️⃣ 기존 회원 데이터 업데이트 (마이그레이션)
-- promotion_usage_history에 이력이 있는 사업자번호 → is_returning_customer = true
UPDATE users u
SET is_returning_customer = true
WHERE EXISTS (
  SELECT 1 
  FROM promotion_usage_history puh 
  WHERE puh.business_number = REPLACE(u.business_number, '-', '')
);

-- billing_payments에 성공한 결제가 있는 사업자번호 → is_returning_customer = true
UPDATE users u
SET is_returning_customer = true
WHERE EXISTS (
  SELECT 1 
  FROM billing_payments bp
  JOIN users u2 ON bp.user_id = u2.user_id
  WHERE REPLACE(u2.business_number, '-', '') = REPLACE(u.business_number, '-', '')
    AND bp.status IN ('paid', 'success')
)
AND is_returning_customer = false;

-- 3️⃣ 확인 쿼리
SELECT 
    is_returning_customer,
    COUNT(*) as count
FROM users
WHERE is_deleted = false
GROUP BY is_returning_customer;

-- 4️⃣ 재가입자 목록 확인
SELECT 
    user_id,
    pharmacist_name,
    pharmacy_name,
    business_number,
    is_returning_customer,
    created_at
FROM users
WHERE is_returning_customer = true
ORDER BY created_at DESC;
