-- support_replies SELECT 정책 간소화 (무한 재귀 방지)
-- 기존 정책 삭제
DROP POLICY IF EXISTS "User can read public replies" ON support_replies;
DROP POLICY IF EXISTS "User read public replies" ON support_replies;

-- 새 정책: 누구나 public 답변을 읽을 수 있음 (자신의 티켓에 대한 답변만)
CREATE POLICY "User can read public replies to own tickets"
ON support_replies
FOR SELECT
TO public
USING (
  is_public = true
  AND ticket_id IN (
    SELECT ticket_id
    FROM support_tickets
    WHERE user_id = auth.uid()
  )
);

-- admins 테이블의 무한 재귀 정책 수정
-- "Super admin manage admins" 정책을 함수 기반으로 변경
DROP POLICY IF EXISTS "Super admin manage admins" ON admins;

-- is_super_admin 함수 생성 (admins 테이블 조회하지 않음)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- auth.jwt()에서 직접 role 확인 (RLS 우회)
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'super_admin'
  );
$$;

-- 또는 더 간단하게: super_admin은 서비스 역할로만 관리
-- 일반 admin API에서는 is_admin() 함수 사용
CREATE POLICY "Super admin manage via service role"
ON admins
FOR ALL
TO public
USING (false)  -- 일반 사용자는 다른 관리자 관리 불가
WITH CHECK (false);

-- Admin이 자신의 정보만 읽을 수 있도록 (중복 정책 정리)
DROP POLICY IF EXISTS "Admin read self" ON admins;
DROP POLICY IF EXISTS "admins_select_own" ON admins;

CREATE POLICY "admins_select_own_final"
ON admins
FOR SELECT
TO public
USING (auth.uid() = admin_id);

-- support_tickets SELECT 정책도 간소화
DROP POLICY IF EXISTS "User can read own tickets" ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_user_own" ON support_tickets;

CREATE POLICY "support_tickets_user_select_own"
ON support_tickets
FOR SELECT
TO public
USING (auth.uid() = user_id);

-- support_attachments SELECT 정책도 간소화
DROP POLICY IF EXISTS "User can read own attachments" ON support_attachments;
DROP POLICY IF EXISTS "User can read own ticket attachments" ON support_attachments;
DROP POLICY IF EXISTS "User read own attachments" ON support_attachments;

CREATE POLICY "support_attachments_user_select_own"
ON support_attachments
FOR SELECT
TO public
USING (
  ticket_id IN (
    SELECT ticket_id
    FROM support_tickets
    WHERE user_id = auth.uid()
  )
);
