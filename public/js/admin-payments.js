// 결제 내역 페이지 로직
let currentPage = 1;
const pageSize = 20;

// Supabase 클라이언트 초기화
const supabaseClient = window.supabase.createClient(
  'https://gitbtujexmsjfixgeoha.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdGJ0dWpleG1zamZpeGdlb2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0NzA5MDIsImV4cCI6MjA4MjA0NjkwMn0.BNN8hauH8NdHZ4vopW_CQ_iK9CR55nfp3JQwuTjrG48'
);

// 페이지 로드 시 인증 확인
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  
  // 검색 버튼 이벤트
  document.getElementById('searchBtn').addEventListener('click', () => searchPayments(1));
  
  // 초기화 버튼 이벤트
  document.getElementById('resetBtn').addEventListener('click', clearFilters);
  
  // 엔터 키로 검색
  ['pharmacyNameSearch', 'pharmacistNameSearch'].forEach(id => {
    document.getElementById(id).addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchPayments(1);
    });
  });
  
  // 초기 데이터 로드
  searchPayments(1);
});

async function checkAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
      window.location.href = '/admin/login';
      return;
    }
    
    // 세션 토큰을 localStorage에 저장
    localStorage.setItem('admin_session_token', session.access_token);
    
  } catch (error) {
    console.error('세션 확인 실패:', error);
    window.location.href = '/admin/login';
  }
}

async function searchPayments(page = 1) {
  currentPage = page;
  
  const sessionToken = localStorage.getItem('admin_session_token');
  const pharmacyName = document.getElementById('pharmacyNameSearch').value.trim();
  const pharmacistName = document.getElementById('pharmacistNameSearch').value.trim();
  const startDate = document.getElementById('startDateSearch').value;
  const endDate = document.getElementById('endDateSearch').value;
  const status = document.getElementById('statusFilter').value;
  
  const tbody = document.getElementById('paymentList');
  tbody.innerHTML = '<tr><td colspan="10" class="has-text-centered"><i class="fas fa-spinner fa-pulse"></i> 로딩 중...</td></tr>';
  
  try {
    const params = new URLSearchParams({
      page: page,
      limit: pageSize,
      pharmacyName: pharmacyName,
      pharmacistName: pharmacistName,
      startDate: startDate,
      endDate: endDate,
      status: status
    });
    
    const response = await fetch(`/admin/api/payments?${params.toString()}`, {
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
      throw new Error('결제 내역 조회 실패');
    }
    
    const data = await response.json();
    renderPayments(data);
  } catch (error) {
    console.error('결제 내역 조회 오류:', error);
    tbody.innerHTML = '<tr><td colspan="10" class="has-text-centered has-text-danger">조회 중 오류가 발생했습니다.</td></tr>';
  }
}

function renderPayments(data) {
  const tbody = document.getElementById('paymentList');
  
  if (!data.payments || data.payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="has-text-centered">결제 내역이 없습니다.</td></tr>';
    return;
  }
  
  const startIndex = (currentPage - 1) * pageSize;
  
  tbody.innerHTML = data.payments.map((payment, idx) => {
    const index = startIndex + idx + 1;
    
    // 결제 상태 표시
    let statusTag, statusText;
    if (payment.status === 'success') {
      statusTag = 'is-success';
      statusText = '성공';
    } else if (payment.status === 'failed') {
      statusTag = 'is-danger';
      statusText = '실패';
    } else if (payment.status === 'canceled') {
      statusTag = 'is-warning';
      statusText = '취소';
    } else {
      statusTag = 'is-light';
      statusText = payment.status || '-';
    }
    
    // 금액 표시 (0원도 정상 - 무료 프로모션)
    const amountText = payment.amount !== null && payment.amount !== undefined 
      ? payment.amount.toLocaleString() + '원' 
      : '-';
    
    return `<tr>
      <td>${index}</td>
      <td>${payment.pharmacy_name || '-'}</td>
      <td>${payment.pharmacist_name || '-'}</td>
      <td>${payment.email || '-'}</td>
      <td style="font-size: 0.85rem;">${payment.order_id || '-'}</td>
      <td><strong>${amountText}</strong></td>
      <td><span class="tag ${statusTag}">${statusText}</span></td>
      <td>${payment.requested_at ? new Date(payment.requested_at).toLocaleString('ko-KR') : '-'}</td>
      <td>${payment.approved_at ? new Date(payment.approved_at).toLocaleString('ko-KR') : '-'}</td>
      <td style="font-size: 0.85rem; color: #f14668;">${payment.fail_reason || '-'}</td>
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
  
  let html = `<a class="pagination-previous" ${currentPage === 1 ? 'disabled' : ''} onclick="searchPayments(${currentPage - 1})">이전</a>`;
  html += `<a class="pagination-next" ${currentPage === totalPages ? 'disabled' : ''} onclick="searchPayments(${currentPage + 1})">다음</a>`;
  html += '<ul class="pagination-list">';
  
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<li><a class="pagination-link ${i === currentPage ? 'is-current' : ''}" onclick="searchPayments(${i})">${i}</a></li>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li><span class="pagination-ellipsis">&hellip;</span></li>';
    }
  }
  
  html += '</ul>';
  pagination.innerHTML = html;
}

function clearFilters() {
  document.getElementById('pharmacyNameSearch').value = '';
  document.getElementById('pharmacistNameSearch').value = '';
  document.getElementById('startDateSearch').value = '';
  document.getElementById('endDateSearch').value = '';
  document.getElementById('statusFilter').value = '';
  searchPayments(1);
}
