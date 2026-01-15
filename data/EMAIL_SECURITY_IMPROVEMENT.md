# 보안 개선: RLS 정책 기반 이메일 조회

## 🔒 문제점

기존 방식:
```javascript
// ❌ 보안 위험: service role key 사용
const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
```

**위험:**
- `supabaseAdmin`(service role key)는 모든 RLS 정책을 우회
- 관리자 페이지 해킹 시 전체 데이터베이스 접근 가능
- auth.users 테이블은 Supabase 내부 테이블이라 RLS 정책 설정 불가

## ✅ 해결 방법

### 1단계: 데이터베이스 스키마 변경

**Supabase SQL Editor**에서 실행:

```bash
# 파일 경로
data/ADD_EMAIL_TO_USERS.sql
```

**주요 변경사항:**
1. `public.users.email` 컬럼 추가
2. `public.admins.email` 컬럼 추가
3. 트리거로 `auth.users.email`과 자동 동기화
4. 기존 데이터 마이그레이션

### 2단계: 서버 코드 변경

**변경 전:**
```javascript
// supabaseAdmin 사용 (RLS 우회)
const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
return { email: authUser?.email };
```

**변경 후:**
```javascript
// req.supabase 사용 (RLS 적용)
const { data: user } = await req.supabase
  .from('users')
  .select('email')
  .eq('user_id', userId)
  .single();
return { email: user?.email };
```

## 🔐 보안 강화

### RLS 정책 적용

**public.users 테이블:**
```sql
-- 관리자 전체 접근 (RLS 정책)
CREATE POLICY "users_admin_full_access" 
ON public.users 
FOR ALL 
USING (is_admin());

-- is_admin() 함수
CREATE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE admin_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**이점:**
- ✅ 관리자만 다른 회원 정보 조회 가능
- ✅ 일반 사용자는 본인 정보만 조회 가능
- ✅ Service role key 불필요
- ✅ 해킹 시에도 RLS 정책으로 보호

## 📊 동기화 방식

### 자동 동기화

```
회원 가입
  └─> auth.users.email 생성
       └─> 트리거 발동
            └─> public.users.email 자동 업데이트

이메일 변경
  └─> auth.users.email 업데이트
       └─> 트리거 발동
            └─> public.users.email 자동 동기화
```

### 수동 동기화 (필요시)

```sql
-- 전체 동기화
UPDATE public.users u
SET email = au.email
FROM auth.users au
WHERE u.user_id = au.id;

UPDATE public.admins a
SET email = au.email
FROM auth.users au
WHERE a.admin_id = au.id;
```

## 🚀 실행 순서

### 1. SQL 실행 (Supabase Dashboard)
1. Supabase 콘솔 접속
2. SQL Editor 메뉴 선택
3. `data/ADD_EMAIL_TO_USERS.sql` 내용 붙여넣기
4. Run 클릭

### 2. 서버 재시작
```bash
# 변경사항이 자동 반영됨
node server.js
```

### 3. 확인
```javascript
// 관리자 페이지에서 회원 목록 조회
// 이메일이 정상적으로 표시되는지 확인
```

## 📝 변경된 API 엔드포인트

### GET /admin/api/users
```javascript
// 회원 목록에서 이메일 직접 조회
email: user.email || 'N/A'
```

### GET /admin/api/users/:userId
```javascript
// 회원 상세에서 이메일 직접 조회
user: {
  ...user,
  email: user.email || 'N/A'
}
```

### 메모 작성자 이메일
```javascript
// admins 테이블 조인으로 이메일 조회
.select(`
  memo_id,
  memo,
  remarks,
  admins!admin_user_memos_admin_id_fkey (
    email
  )
`)
```

## ⚠️ 주의사항

1. **데이터 동기화 확인**
   - SQL 스크립트 실행 후 동기화 상태 확인
   - 결과에서 "✅ 동기화됨" 확인

2. **기존 데이터**
   - 트리거는 새로운 변경사항만 감지
   - 기존 데이터는 SQL의 UPDATE 문으로 일괄 동기화

3. **성능**
   - 인덱스가 자동 생성되어 검색 성능 최적화
   - auth.users 조인 없이 직접 조회로 속도 향상

## 🎯 결론

**변경 전:**
- 🔴 supabaseAdmin (service role) 사용
- 🔴 RLS 우회
- 🔴 보안 위험

**변경 후:**
- 🟢 req.supabase (anon key + JWT) 사용
- 🟢 RLS 정책 적용
- 🟢 보안 강화
- 🟢 성능 향상
