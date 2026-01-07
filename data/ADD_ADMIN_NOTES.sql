-- users 테이블에 admin_notes 컬럼 추가
-- 관리자가 회원별로 메모를 남길 수 있는 기능

ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

COMMENT ON COLUMN users.admin_notes IS '관리자 비고 (내부 메모)';
