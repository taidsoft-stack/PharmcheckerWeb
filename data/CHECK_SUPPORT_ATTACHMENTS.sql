-- 문의 첨부파일 확인 쿼리
-- Supabase SQL Editor에서 실행

-- 1. 모든 첨부파일 정보 확인
SELECT 
  sa.attachment_id,
  sa.ticket_id,
  sa.reply_id,
  sa.file_path,
  sa.file_name,
  sa.mime_type,
  sa.file_size,
  sa.uploaded_by,
  sa.created_at,
  st.title as ticket_title,
  st.status as ticket_status
FROM support_attachments sa
LEFT JOIN support_tickets st ON sa.ticket_id = st.ticket_id
ORDER BY sa.created_at DESC
LIMIT 20;

-- 2. 문의별 첨부파일 개수
SELECT 
  st.ticket_id,
  st.title,
  st.status,
  COUNT(sa.attachment_id) as attachment_count
FROM support_tickets st
LEFT JOIN support_attachments sa ON st.ticket_id = sa.ticket_id AND sa.reply_id IS NULL
GROUP BY st.ticket_id, st.title, st.status
HAVING COUNT(sa.attachment_id) > 0
ORDER BY st.created_at DESC;

-- 3. 특정 문의의 첨부파일 상세 (ticket_id 변경)
SELECT 
  sa.*
FROM support_attachments sa
WHERE sa.ticket_id = 'ee910fba-a05f-4b10-afe1-8e68965b1e37'
ORDER BY sa.created_at;

-- 4. Storage 버킷 확인 (Supabase Storage Objects)
SELECT 
  name,
  bucket_id,
  owner,
  metadata,
  created_at,
  updated_at
FROM storage.objects
WHERE bucket_id = 'support-attachments'
ORDER BY created_at DESC
LIMIT 20;

-- 5. 파일 경로 패턴 확인
SELECT 
  file_path,
  file_name,
  ticket_id,
  created_at
FROM support_attachments
ORDER BY created_at DESC
LIMIT 10;
