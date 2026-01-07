-- admin_user_memos 테이블 개선
-- 1. updated_at 컬럼 추가 (메모 수정 시각 추적)
-- 2. remarks 컬럼 추가 (간단한 비고, 회원 목록 테이블에 표시용)

-- updated_at 컬럼 추가
ALTER TABLE admin_user_memos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

COMMENT ON COLUMN admin_user_memos.updated_at IS '메모 최종 수정 시각';

-- remarks 컬럼 추가 (짧은 비고용, 최대 200자)
ALTER TABLE admin_user_memos
ADD COLUMN IF NOT EXISTS remarks VARCHAR(200);

COMMENT ON COLUMN admin_user_memos.remarks IS '간단한 비고 (회원 목록 표시용, 최대 200자)';

-- updated_at 자동 업데이트 트리거 생성
CREATE OR REPLACE FUNCTION update_admin_user_memos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 연결 (이미 존재하면 먼저 삭제)
DROP TRIGGER IF EXISTS trigger_update_admin_user_memos_updated_at ON admin_user_memos;

CREATE TRIGGER trigger_update_admin_user_memos_updated_at
    BEFORE UPDATE ON admin_user_memos
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_user_memos_updated_at();

COMMENT ON TRIGGER trigger_update_admin_user_memos_updated_at ON admin_user_memos IS 
'메모 수정 시 updated_at을 자동으로 현재 시각으로 업데이트';
