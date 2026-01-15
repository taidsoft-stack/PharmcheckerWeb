-- ========================================
-- Supabase Storage RLS 정책 설정
-- Storage -> support-attachments 버킷
-- ========================================

-- 1️⃣ 먼저 버킷의 RLS 상태 확인
-- Supabase Dashboard -> Storage -> support-attachments -> Settings
-- "Enable RLS" 체크 여부 확인

-- 2️⃣ 기존 정책 삭제 (있으면)
DROP POLICY IF EXISTS "Admin full access to support attachments" ON storage.objects;
DROP POLICY IF EXISTS "User can upload own ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "User can view own ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Service role bypass RLS" ON storage.objects;

-- 3️⃣ 관리자 전체 접근 정책 (가장 중요!)
-- 관리자는 모든 첨부파일에 대해 SELECT, INSERT, UPDATE, DELETE 가능
CREATE POLICY "Admin full access to support attachments"
ON storage.objects
FOR ALL
TO public
USING (
  bucket_id = 'support-attachments' AND
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.admin_id = auth.uid()
    AND admins.is_active = true
  )
)
WITH CHECK (
  bucket_id = 'support-attachments' AND
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.admin_id = auth.uid()
    AND admins.is_active = true
  )
);

-- 4️⃣ 사용자가 자신의 문의 첨부파일 업로드 가능
CREATE POLICY "User can upload own ticket attachments"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'support-attachments' AND
  -- 파일 경로의 첫 번째 폴더(ticket_id)가 자신의 문의인지 확인
  (storage.foldername(name))[1] IN (
    SELECT ticket_id::text FROM public.support_tickets
    WHERE user_id = auth.uid()
  )
);

-- 5️⃣ 사용자가 자신의 문의 첨부파일 조회 가능
CREATE POLICY "User can view own ticket attachments"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'support-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT ticket_id::text FROM public.support_tickets
    WHERE user_id = auth.uid()
  )
);

-- ========================================
-- 중요: Service Role은 RLS를 자동으로 우회합니다!
-- 서버에서 supabase (service role)로 Signed URL을 생성하므로
-- 별도의 우회 정책이 필요 없습니다.
-- ========================================


-- ========================================
-- 📋 적용 방법 (Supabase Dashboard)
-- ========================================
-- 
-- 1️⃣ Supabase Dashboard 로그인
--    https://supabase.com/dashboard
-- 
-- 2️⃣ SQL Editor로 이동
--    왼쪽 메뉴 -> SQL Editor -> New Query
-- 
-- 3️⃣ 위의 DROP/CREATE POLICY SQL 복사 & 실행
--    (3️⃣~5️⃣ 섹션만 복사)
-- 
-- 4️⃣ Run 버튼 클릭
-- 
-- 5️⃣ 정책 확인
--    Storage -> support-attachments -> Policies
--    3개의 정책이 생성되어야 함:
--    ✅ Admin full access to support attachments
--    ✅ User can upload own ticket attachments
--    ✅ User can view own ticket attachments
-- 
-- 6️⃣ 버킷 설정 확인 (중요!)
--    Storage -> support-attachments -> Settings
--    - Public bucket: ❌ OFF (Private로 유지)
--    - Restrict file upload size: 10 MB
--    - Allowed MIME types: (비어있거나 image/*, application/pdf 등)
-- 
-- ========================================


-- ========================================
-- 🔍 확인 쿼리
-- ========================================

-- ⚠️ 현재 2개만 적용되어 있다면 아래 쿼리로 확인하세요!
-- 어떤 정책이 빠졌는지 확인

-- 0. Storage 정책 전체 조회 (가장 중요!)
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN policyname LIKE '%Admin%' THEN '관리자'
    WHEN policyname LIKE '%upload%' THEN '업로드'
    WHEN policyname LIKE '%view%' THEN '조회'
    ELSE '기타'
  END as policy_type,
  LENGTH(qual) as qual_length,
  LENGTH(with_check) as with_check_length
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname LIKE '%support%' OR
    bucket_id = 'support-attachments' OR
    qual LIKE '%support%' OR
    with_check LIKE '%support%'
  )
ORDER BY policyname;

-- 필요한 3개 정책:
-- 1. Admin full access to support attachments (FOR ALL)
-- 2. User can upload own ticket attachments (FOR INSERT) 
-- 3. User can view own ticket attachments (FOR SELECT)


-- ========================================
-- 🚨 2개만 나온다면? 빠진 정책 찾기
-- ========================================

-- 각 정책이 있는지 개별 확인
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' 
      AND tablename = 'objects'
      AND policyname = 'Admin full access to support attachments'
    ) THEN '✅ Admin 정책 있음'
    ELSE '❌ Admin 정책 없음 - 이것이 문제!'
  END as admin_policy;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' 
      AND tablename = 'objects'
      AND policyname = 'User can upload own ticket attachments'
    ) THEN '✅ User Upload 정책 있음'
    ELSE '❌ User Upload 정책 없음'
  END as user_upload_policy;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' 
      AND tablename = 'objects'
      AND policyname = 'User can view own ticket attachments'
    ) THEN '✅ User View 정책 있음'
    ELSE '❌ User View 정책 없음'
  END as user_view_policy;


-- ========================================
-- 🔧 빠진 정책만 추가하기
-- ========================================

-- Admin 정책이 없다면:
-- CREATE POLICY "Admin full access to support attachments" ...

-- User Upload 정책이 없다면:
-- CREATE POLICY "User can upload own ticket attachments" ...

-- User View 정책이 없다면:
-- CREATE POLICY "User can view own ticket attachments" ...


-- 1. 버킷 설정 확인
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id = 'support-attachments';

-- 2. 현재 적용된 Storage 정책 확인
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%support%'
ORDER BY policyname;

-- 3. Storage에 있는 파일 목록
SELECT 
  name,
  id,
  bucket_id,
  owner,
  created_at,
  metadata->>'size' as file_size,
  metadata->>'mimetype' as mime_type
FROM storage.objects
WHERE bucket_id = 'support-attachments'
ORDER BY created_at DESC
LIMIT 20;

-- 4. DB 메타데이터와 Storage 파일 매칭 확인
SELECT 
  sa.file_name,
  sa.file_path,
  sa.mime_type,
  sa.file_size,
  so.name as storage_name,
  CASE 
    WHEN so.id IS NOT NULL THEN '✅ Storage에 존재'
    ELSE '❌ Storage에 없음'
  END as status
FROM public.support_attachments sa
LEFT JOIN storage.objects so ON sa.file_path = so.name AND so.bucket_id = 'support-attachments'
ORDER BY sa.created_at DESC
LIMIT 20;

-- 버킷 설정 확인 쿼리
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id = 'support-attachments';

-- 현재 Storage Objects 확인
SELECT 
  name,
  id,
  bucket_id,
  owner,
  created_at,
  updated_at,
  last_accessed_at,
  metadata
FROM storage.objects
WHERE bucket_id = 'support-attachments'
ORDER BY created_at DESC
LIMIT 20;
