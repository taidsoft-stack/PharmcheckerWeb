-- ========================================
-- 🚨 긴급 수정: Service Role Bypass 정책
-- ========================================
-- 
-- 문제: 3개 정책이 모두 있는데도 Signed URL 생성 실패
-- 원인: Service Role이 Storage 객체에 접근하지 못함
-- 해결: Service Role이 RLS를 우회하도록 정책 추가
--
-- ========================================

-- 1️⃣ Service Role Bypass 정책 추가
CREATE POLICY "Service role can access all storage objects"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2️⃣ Authenticated users can read support-attachments (임시 테스트용)
-- 이 정책은 나중에 삭제 가능 (Service Role만으로 충분)
CREATE POLICY "Authenticated can read support attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'support-attachments');


-- ========================================
-- 🔍 적용 후 확인
-- ========================================

-- 모든 Storage 정책 조회
SELECT 
  policyname,
  cmd,
  roles::text,
  CASE 
    WHEN policyname LIKE '%Service%' THEN '✅ Service Role'
    WHEN policyname LIKE '%Admin%' THEN '🔐 Admin'
    WHEN policyname LIKE '%upload%' THEN '⬆️ Upload'
    WHEN policyname LIKE '%view%' OR policyname LIKE '%read%' THEN '👁️ Read'
    ELSE '❓ 기타'
  END as type
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- 총 5개 정책이 있어야 함:
-- 1. Service role can access all storage objects (FOR ALL, service_role)
-- 2. Authenticated can read support attachments (FOR SELECT, authenticated) - 임시
-- 3. Admin full access to support attachments (FOR ALL, public)
-- 4. User can upload own ticket attachments (FOR INSERT, public)
-- 5. User can view own ticket attachments (FOR SELECT, public)
