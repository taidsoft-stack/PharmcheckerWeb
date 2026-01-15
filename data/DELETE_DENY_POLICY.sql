-- ========================================
-- 🔥 긴급: 문제 정책 삭제
-- ========================================
-- 
-- 문제: "Deny direct read on support-attachments" 정책이
--       Signed URL 접근을 차단하고 있음
-- 
-- 해결: 이 정책을 삭제
-- ========================================

-- ❌ 문제 정책 삭제
DROP POLICY IF EXISTS "Deny direct read on support-attachments" ON storage.objects;

-- ========================================
-- 🔍 삭제 후 확인
-- ========================================

SELECT 
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- 예상 결과: 5개 정책 (Deny 정책 제외)
-- 1. Admin full access to support attachments
-- 2. Service role can access all storage objects
-- 3. User can upload own ticket attachments
-- 4. User can view own ticket attachments
-- 5. pharmchecker_releases_access (다른 버킷용)
