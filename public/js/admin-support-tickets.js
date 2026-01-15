// 문의 내역 페이지 로직
let currentPage = 1;
const pageSize = 20;

// Supabase 클라이언트 초기화
const supabaseClient = window.supabase.createClient(
  'https://gitbtujexmsjfixgeoha.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdGJ0dWpleG1zamZpeGdlb2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0NzA5MDIsImV4cCI6MjA4MjA0NjkwMn0.BNN8hauH8NdHZ4vopW_CQ_iK9CR55nfp3JQwuTjrG48'
);

// 유틸리티 함수: 파일 크기 포맷
function formatFileSize(bytes) {
  if (!bytes) return '알 수 없음';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 페이지 로드 시 인증 확인
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  // 검색 버튼 이벤트
  document.getElementById('searchBtn').addEventListener('click', () => searchTickets(1));
  
  // 초기 데이터 로드
  searchTickets(1);
});

async function checkAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
      window.location.href = '/admin/login';
      return;
    }
    
    localStorage.setItem('admin_session_token', session.access_token);
  } catch (error) {
    console.error('세션 확인 실패:', error);
    window.location.href = '/admin/login';
  }
}

async function searchTickets(page = 1) {
  currentPage = page;
  
  const sessionToken = localStorage.getItem('admin_session_token');
  const status = document.getElementById('statusFilter').value;
  
  const tbody = document.getElementById('ticketList');
  tbody.innerHTML = '<tr><td colspan="9" class="has-text-centered"><i class="fas fa-spinner fa-pulse"></i> 로딩 중...</td></tr>';
  
  try {
    const params = new URLSearchParams({
      page: page,
      limit: pageSize,
      status: status
    });
    
    const response = await fetch(`/admin/api/support-tickets?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        alert('세션이 만료되었습니다. 다시 로그인해주세요.');
        localStorage.removeItem('admin_session_token');
        window.location.href = '/admin/login';
        return;
      }
      throw new Error('문의 조회 실패');
    }
    
    const data = await response.json();
    renderTickets(data);
  } catch (error) {
    console.error('문의 조회 오류:', error);
    tbody.innerHTML = '<tr><td colspan="9" class="has-text-centered has-text-danger">조회 중 오류가 발생했습니다.</td></tr>';
  }
}

function renderTickets(data) {
  const tbody = document.getElementById('ticketList');
  
  if (!data.tickets || data.tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="has-text-centered">문의 내역이 없습니다.</td></tr>';
    return;
  }
  
  const startIndex = (currentPage - 1) * pageSize;
  
  tbody.innerHTML = data.tickets.map((ticket, idx) => {
    const index = startIndex + idx + 1;
    
    // 상태 표시
    let statusTag, statusText;
    if (ticket.status === 'open') {
      statusTag = 'is-warning';
      statusText = '대기';
    } else if (ticket.status === 'answered') {
      statusTag = 'is-info';
      statusText = '답변완료';
    } else if (ticket.status === 'closed') {
      statusTag = 'is-light';
      statusText = '종료';
    } else {
      statusTag = 'is-light';
      statusText = ticket.status || '-';
    }
    
    return `<tr>
      <td>${index}</td>
      <td><span class="tag ${statusTag}">${statusText}</span></td>
      <td>${ticket.pharmacy_name || '-'}</td>
      <td>${ticket.pharmacist_name || '-'}</td>
      <td>${ticket.email || '-'}</td>
      <td>${ticket.title || '-'}</td>
      <td>${ticket.created_at ? new Date(ticket.created_at).toLocaleString('ko-KR') : '-'}</td>
      <td>${ticket.updated_at ? new Date(ticket.updated_at).toLocaleString('ko-KR') : '-'}</td>
      <td>
        <button class="button is-small is-info" onclick="viewTicketDetail('${ticket.ticket_id}')">
          <i class="fas fa-eye"></i>&nbsp; 상세
        </button>
      </td>
    </tr>`;
  }).join('');
  
  renderPagination(data.total, data.page, data.totalPages);
}

function renderPagination(total, currentPage, totalPages) {
  const pagination = document.getElementById('pagination');
  
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  
  let html = `<a class="pagination-previous" ${currentPage === 1 ? 'disabled' : ''} onclick="searchTickets(${currentPage - 1})">이전</a>`;
  html += `<a class="pagination-next" ${currentPage === totalPages ? 'disabled' : ''} onclick="searchTickets(${currentPage + 1})">다음</a>`;
  html += '<ul class="pagination-list">';
  
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<li><a class="pagination-link ${i === currentPage ? 'is-current' : ''}" onclick="searchTickets(${i})">${i}</a></li>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li><span class="pagination-ellipsis">&hellip;</span></li>';
    }
  }
  
  html += '</ul>';
  pagination.innerHTML = html;
}

async function viewTicketDetail(ticketId) {
  const modal = document.getElementById('ticketModal');
  const body = document.getElementById('ticketDetailBody');
  
  body.innerHTML = '<div class="has-text-centered"><i class="fas fa-spinner fa-pulse"></i> 로딩 중...</div>';
  modal.classList.add('is-active');
  
  try {
    const sessionToken = localStorage.getItem('admin_session_token');
    const response = await fetch(`/admin/api/support-tickets/${ticketId}`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('문의 상세 조회 실패');
    }
    
    const data = await response.json();
    renderTicketDetail(data);
  } catch (error) {
    console.error('문의 상세 조회 오류:', error);
    body.innerHTML = '<div class="has-text-centered has-text-danger">조회 중 오류가 발생했습니다.</div>';
  }
}

function renderTicketDetail(data) {
  const body = document.getElementById('ticketDetailBody');
  
  // 전역 변수에 현재 문의 ID 저장 (답변 작성 시 사용)
  window.currentTicketId = data.ticket.ticket_id;
  
  let html = `
    <div class="content">
      <h4>${data.ticket.title}</h4>
      <p><strong>상태:</strong> ${data.ticket.status}</p>
      <p><strong>작성자:</strong> ${data.ticket.pharmacy_name} (${data.ticket.email})</p>
      <p><strong>작성일:</strong> ${new Date(data.ticket.created_at).toLocaleString('ko-KR')}</p>
      <hr>
      <p>${data.ticket.content}</p>
    </div>
  `;
  
  if (data.attachments && data.attachments.length > 0) {
    html += '<div class="content"><h5>첨부파일</h5>';
    data.attachments.forEach(att => {
      if (att.file_url) {
        // 이미지 파일인 경우 미리보기 표시
        if (att.mime_type?.startsWith('image/')) {
          html += `
            <div class="box">
              <p><strong>${att.file_name}</strong> (${formatFileSize(att.file_size)})</p>
              <figure class="image">
                <img src="${att.file_url}" alt="${att.file_name}" style="max-width: 100%; height: auto;">
              </figure>
              <a href="${att.file_url}" class="button is-small is-link" target="_blank" download="${att.file_name}">
                <i class="fas fa-download"></i>&nbsp; 다운로드
              </a>
            </div>
          `;
        } else {
          // 일반 파일인 경우 다운로드 링크만 표시
          html += `
            <div class="box">
              <p><strong>${att.file_name}</strong> (${formatFileSize(att.file_size)})</p>
              <a href="${att.file_url}" class="button is-small is-link" target="_blank" download="${att.file_name}">
                <i class="fas fa-download"></i>&nbsp; 다운로드
              </a>
            </div>
          `;
        }
      } else {
        // URL이 없는 경우 파일명만 표시
        html += `<p class="has-text-danger">${att.file_name} (파일을 찾을 수 없습니다)</p>`;
      }
    });
    html += '</div>';
  }
  
  if (data.replies && data.replies.length > 0) {
    html += '<div class="content"><h5>답변 내역</h5>';
    data.replies.forEach(reply => {
      html += `
        <div class="box">
          <p><strong>${reply.admin_email}</strong> - ${new Date(reply.created_at).toLocaleString('ko-KR')}</p>
          <p>${reply.reply_content}</p>
      `;
      
      // 답변 첨부파일 표시
      if (data.reply_attachments && data.reply_attachments.length > 0) {
        const replyAttachments = data.reply_attachments.filter(att => att.reply_id === reply.reply_id);
        if (replyAttachments.length > 0) {
          html += '<div style="margin-top: 1rem;"><strong>첨부파일:</strong>';
          replyAttachments.forEach(att => {
            if (att.file_url) {
              if (att.mime_type?.startsWith('image/')) {
                html += `
                  <div style="margin-top: 0.5rem;">
                    <p>${att.file_name} (${formatFileSize(att.file_size)})</p>
                    <figure class="image" style="margin-top: 0.5rem;">
                      <img src="${att.file_url}" alt="${att.file_name}" style="max-width: 100%; height: auto;">
                    </figure>
                    <a href="${att.file_url}" class="button is-small is-link" target="_blank" download="${att.file_name}">
                      <i class="fas fa-download"></i>&nbsp; 다운로드
                    </a>
                  </div>
                `;
              } else {
                html += `
                  <div style="margin-top: 0.5rem;">
                    <a href="${att.file_url}" class="button is-small is-link" target="_blank" download="${att.file_name}">
                      <i class="fas fa-file"></i>&nbsp; ${att.file_name} (${formatFileSize(att.file_size)})
                    </a>
                  </div>
                `;
              }
            }
          });
          html += '</div>';
        }
      }
      
      html += `</div>`;
    });
    html += '</div>';
  }
  
  // 답변 작성 버튼 추가
  html += `
    <div class="has-text-centered" style="margin-top: 1.5rem;">
      <button class="button is-primary" onclick="openReplyModal()">
        <i class="fas fa-reply"></i>&nbsp; 답변 작성
      </button>
    </div>
  `;
  
  body.innerHTML = html;
}

function closeTicketModal() {
  document.getElementById('ticketModal').classList.remove('is-active');
}

function openReplyModal() {
  document.getElementById('replyContent').value = '';
  document.getElementById('replyModal').classList.add('is-active');
}

function closeReplyModal() {
  document.getElementById('replyModal').classList.remove('is-active');
  document.getElementById('replyFiles').value = '';
  document.getElementById('fileName').textContent = '선택된 파일 없음';
}

function updateFileName() {
  const fileInput = document.getElementById('replyFiles');
  const fileNameDisplay = document.getElementById('fileName');
  
  if (fileInput.files.length > 0) {
    if (fileInput.files.length === 1) {
      fileNameDisplay.textContent = fileInput.files[0].name;
    } else {
      fileNameDisplay.textContent = `${fileInput.files.length}개 파일 선택됨`;
    }
  } else {
    fileNameDisplay.textContent = '선택된 파일 없음';
  }
}

async function submitReply() {
  const replyContent = document.getElementById('replyContent').value.trim();
  
  if (!replyContent) {
    alert('답변 내용을 입력해주세요.');
    return;
  }
  
  if (!window.currentTicketId) {
    alert('문의 정보를 찾을 수 없습니다.');
    return;
  }
  
  try {
    const sessionToken = localStorage.getItem('admin_session_token');
    
    // FormData 생성 (파일 업로드 지원)
    const formData = new FormData();
    formData.append('reply_content', replyContent);
    
    // 첨부파일 추가
    const fileInput = document.getElementById('replyFiles');
    if (fileInput.files.length > 0) {
      for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('attachments', fileInput.files[i]);
      }
    }
    
    const response = await fetch(`/admin/api/support-tickets/${window.currentTicketId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`
        // Content-Type을 설정하지 않음 (multipart/form-data boundary 자동 설정)
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '답변 전송 실패');
    }
    
    const result = await response.json();
    
    alert('답변이 전송되었습니다.');
    closeReplyModal();
    
    // 문의 상세 다시 로드
    await viewTicketDetail(window.currentTicketId);
    
    // 문의 목록도 다시 로드 (상태 업데이트 반영)
    searchTickets(currentPage);
  } catch (error) {
    console.error('답변 전송 오류:', error);
    alert('답변 전송 중 오류가 발생했습니다: ' + error.message);
  }
}
