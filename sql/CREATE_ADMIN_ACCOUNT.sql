-- ================================================
-- 관리자 계정 생성 가이드
-- ================================================

-- 1. 먼저 구글 로그인으로 일반 회원가입 진행
--    (PharmChecker 회원가입 페이지에서 구글 로그인)

-- 2. 가입한 이메일로 auth.users에서 UUID 확인
SELECT id, email, raw_user_meta_data->>'name' as name, created_at
FROM auth.users
WHERE email = '관리자@이메일.com';

-- 3. 해당 UUID를 admins 테이블에 추가하여 관리자로 승격
-- role 종류: 'super_admin', 'admin', 'operator'
INSERT INTO public.admins (admin_id, role, is_active, created_at, updated_at)
VALUES 
  ('위에서 확인한 UUID를 여기에', 'super_admin', true, NOW(), NOW())
ON CONFLICT (admin_id) DO NOTHING;

-- 4. 생성된 관리자 계정 확인
SELECT 
  a.admin_id,
  u.email,
  u.raw_user_meta_data->>'name' as name,
  a.role,
  a.is_active,
  a.created_at
FROM public.admins a
JOIN auth.users u ON a.admin_id = u.id
WHERE a.is_active = true
ORDER BY a.created_at DESC;

-- ================================================
-- 역할별 권한 설명
-- ================================================
-- super_admin: 모든 기능 접근 가능 (관리자 계정 관리 포함)
-- admin: 대부분의 기능 접근 가능 (관리자 계정 관리 제외)
-- operator: 제한적 기능만 접근 (조회, 일부 업데이트만)

-- ================================================
-- 관리자 로그인 방법
-- ================================================
-- 1. /ops-dashboard/login 페이지 접속
-- 2. 구글 계정으로 로그인 (일반 회원가입 시 사용한 구글 계정)
-- 3. public.admins 테이블에 등록된 경우에만 로그인 성공

-- ================================================
-- 예시: 테스트 관리자 계정 승격
-- ================================================
-- 주의: 실제 UUID로 반드시 변경하세요
/*
-- 1단계: UUID 확인
SELECT id FROM auth.users WHERE email = 'test@example.com';

-- 2단계: 관리자로 승격
INSERT INTO public.admins (admin_id, role, is_active, created_at, updated_at)
VALUES 
  ('12345678-1234-1234-1234-123456789012', 'super_admin', true, NOW(), NOW());
*/
