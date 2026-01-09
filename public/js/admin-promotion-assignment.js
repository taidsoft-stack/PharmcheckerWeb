/**
 * 프로모션 할당 관리 JavaScript
 * 관리자 대시보드 - 프로모션 할당 페이지 전용
 */

// 전역 변수
let promotionCandidatesList = [];
let promotionSelectedCandidates = [];
let promotionCurrentUserDetail = null;

/**
 * 프로모션 할당 페이지 초기화
 */
async function assignPromotionInitPage() {
  await assignPromotionLoadCandidates();
  await assignPromotionLoadFirstPaymentPromotions();
  await assignPromotionLoadReservations();
  await assignPromotionLoadAppliedHistory();
  await assignPromotionLoadAssignmentList();
}

/**
 * 첫 결제 예정 후보 목록 조회
 */
async function assignPromotionLoadCandidates() {
  const pharmacistName = document.getElementById('filterPharmacistName').value.trim();
  const pharmacyName = document.getElementById('filterPharmacyName').value.trim();

  try {
    const params = new URLSearchParams();
    if (pharmacistName) params.append('pharmacist_name', pharmacistName);
    if (pharmacyName) params.append('pharmacy_name', pharmacyName);

    const response = await fetch('/admin/api/assign-promotion/candidates?' + params, {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    promotionCandidatesList = data.candidates || [];

    assignPromotionRenderCandidatesTable();
  } catch (error) {
    console.error('후보 목록 조회 오류:', error);
    document.getElementById('candidatesTableBody').innerHTML = 
      '<tr><td colspan="9" class="has-text-centered has-text-danger">오류가 발생했습니다</td></tr>';
  }
}

/**
 * 후보 목록 테이블 렌더링
 */
function assignPromotionRenderCandidatesTable() {
  const tbody = document.getElementById('candidatesTableBody');

  if (promotionCandidatesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="has-text-centered">첫 결제 예정 고객이 없습니다</td></tr>';
    return;
  }

  tbody.innerHTML = promotionCandidatesList.map((user, index) => {
    const firstPaymentBadge = user.is_first_payment 
      ? '<span class="tag is-success">✅ 첫 결제</span>' 
      : '<span class="tag is-danger">❌ 기존 고객</span>';

    const subscriptionBadge = user.subscription_status 
      ? '<span class="tag is-info">' + user.subscription_status + '</span>' 
      : '<span class="tag is-light">없음</span>';

    const promotionStatusBadge = user.has_pending_promotion
      ? '<span class="tag is-warning">예약됨</span>'
      : '<span class="tag is-light">없음</span>';

    return `
      <tr class="candidate-row">
        <td class="has-text-centered">
          <input type="checkbox" class="candidate-checkbox" value="${user.user_id}" 
            data-index="${index}" onchange="assignPromotionUpdateSelectionState()">
        </td>
        <td>
          <strong>${user.pharmacist_name || '-'}</strong><br>
          <small>${user.pharmacy_name || '-'}</small>
        </td>
        <td><small>${user.business_number || '-'}</small></td>
        <td><small>${new Date(user.created_at).toLocaleDateString('ko-KR')}</small></td>
        <td>${subscriptionBadge}</td>
        <td>${firstPaymentBadge}</td>
        <td>${user.next_billing_at ? new Date(user.next_billing_at).toLocaleString('ko-KR') : '-'}</td>
        <td>${promotionStatusBadge}</td>
        <td>
          <button class="button is-small is-info" onclick="assignPromotionOpenUserDetailModal('${user.user_id}')">
            <span class="icon"><i class="fas fa-search"></i></span>
            <span>상세</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 전체 선택/해제
 */
function assignPromotionToggleSelectAll() {
  const selectAll = document.getElementById('selectAllCandidates').checked;
  const checkboxes = document.querySelectorAll('.candidate-checkbox');
  
  checkboxes.forEach(cb => cb.checked = selectAll);
  assignPromotionUpdateSelectionState();
}

/**
 * 선택 상태 업데이트
 */
function assignPromotionUpdateSelectionState() {
  const checkboxes = document.querySelectorAll('.candidate-checkbox:checked');
  promotionSelectedCandidates = Array.from(checkboxes).map(cb => {
    const index = parseInt(cb.dataset.index);
    return promotionCandidatesList[index];
  });

  const count = promotionSelectedCandidates.length;
  const notification = document.getElementById('selectedCountNotification');
  const bulkSection = document.getElementById('bulkAssignSection');
  const countText = document.getElementById('selectedCountText');
  const buttonText = document.getElementById('bulkAssignButtonText');

  if (count > 0) {
    notification.style.display = 'block';
    bulkSection.style.display = 'block';
    countText.textContent = count + '명 선택됨';
    buttonText.textContent = count + '명에게 프로모션 할당';
  } else {
    notification.style.display = 'none';
    bulkSection.style.display = 'none';
  }
}

/**
 * 선택 초기화
 */
function assignPromotionClearSelection() {
  document.getElementById('selectAllCandidates').checked = false;
  document.querySelectorAll('.candidate-checkbox').forEach(cb => cb.checked = false);
  assignPromotionUpdateSelectionState();
}

/**
 * 첫 결제 전용 프로모션 목록 로드
 */
async function assignPromotionLoadFirstPaymentPromotions() {
  try {
    const response = await fetch('/admin/api/promotions', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const promotions = (data.promotions || []).filter(p => p.is_active && p.first_payment_only);

    const options = promotions.map(p => {
      let discountInfo = '';
      if (p.discount_type === 'free') {
        discountInfo = p.free_months + '개월 무료';
      } else if (p.discount_type === 'percent') {
        discountInfo = p.discount_value + '% 할인';
      } else if (p.discount_type === 'amount') {
        discountInfo = p.discount_value.toLocaleString() + '원 할인';
      }
      return '<option value="' + p.promotion_id + '">' + p.promotion_name + ' (' + discountInfo + ')</option>';
    }).join('');

    document.getElementById('bulkPromotionSelect').innerHTML = 
      '<option value="">프로모션을 선택하세요</option>' + options;
    document.getElementById('singlePromotionSelect').innerHTML = 
      '<option value="">프로모션을 선택하세요</option>' + options;

  } catch (error) {
    console.error('프로모션 조회 오류:', error);
  }
}

/**
 * 일괄 할당 실행
 */
async function assignPromotionExecuteBulkAssign() {
  const promotionId = document.getElementById('bulkPromotionSelect').value;
  const memo = document.getElementById('bulkAssignMemo').value.trim();

  if (!promotionId) {
    alert('프로모션을 선택해주세요.');
    return;
  }

  if (promotionSelectedCandidates.length === 0) {
    alert('할당 대상 회원을 선택해주세요.');
    return;
  }

  if (!confirm(promotionSelectedCandidates.length + '명에게 프로모션을 할당하시겠습니까?')) {
    return;
  }

  try {
    const response = await fetch('/admin/api/assign-promotion', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        promotion_id: promotionId,
        user_ids: promotionSelectedCandidates.map(u => u.user_id),
        memo: memo || null,
        source: 'admin_assigned'
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(result.message || '프로모션이 할당되었습니다.');
      assignPromotionClearSelection();
      await assignPromotionLoadCandidates();
      await assignPromotionLoadAssignmentList();
    } else {
      alert('할당 실패: ' + (result.error || '알 수 없는 오류'));
    }

  } catch (error) {
    console.error('일괄 할당 오류:', error);
    alert('할당 중 오류가 발생했습니다.');
  }
}

/**
 * 회원 상세 모달 열기
 */
async function assignPromotionOpenUserDetailModal(userId) {
  document.getElementById('userDetailModal').classList.add('is-active');
  
  const user = promotionCandidatesList.find(u => u.user_id === userId);
  if (!user) {
    alert('회원 정보를 찾을 수 없습니다.');
    return;
  }

  promotionCurrentUserDetail = user;

  // 기본 정보 표시
  document.getElementById('detailPharmacistName').textContent = user.pharmacist_name || '-';
  document.getElementById('detailPharmacyName').textContent = user.pharmacy_name || '-';
  document.getElementById('detailEmail').textContent = user.email || '-';
  document.getElementById('detailPhone').textContent = user.pharmacist_phone || '-';
  document.getElementById('detailBusinessNumber').textContent = user.business_number || '-';

  // 프로모션 드롭다운 로드
  await assignPromotionLoadFirstPaymentPromotions();

  // 상세 정보 로드
  await assignPromotionLoadUserPromotionHistory(userId, user.business_number);
  await assignPromotionLoadUserSubscriptionStatus(userId);
  await assignPromotionLoadUserPendingPromotions(userId);
  assignPromotionCheckAssignmentEligibility(user);
}

/**
 * 회원 상세 모달 닫기
 */
function assignPromotionCloseUserDetailModal() {
  document.getElementById('userDetailModal').classList.remove('is-active');
  promotionCurrentUserDetail = null;
}

/**
 * 회원 프로모션 이력 조회
 */
async function assignPromotionLoadUserPromotionHistory(userId, businessNumber) {
  try {
    const response = await fetch('/admin/api/users/' + userId + '/promotion-history?business_number=' + businessNumber, {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const history = data.history || [];

    const summaryDiv = document.getElementById('promotionHistorySummary');

    if (history.length === 0) {
      summaryDiv.innerHTML = '<p class="has-text-centered">✅ 프로모션 사용 이력이 없습니다 (신규 고객)</p>';
      return;
    }

    summaryDiv.innerHTML = `
      <table class="table is-fullwidth is-narrow">
        <thead>
          <tr>
            <th>프로모션 코드</th>
            <th>사용 개월</th>
            <th>소진 여부</th>
            <th>마지막 사용</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(h => `
            <tr>
              <td>${h.promotion_code}</td>
              <td>${h.used_months}개월</td>
              <td>${h.is_exhausted ? '<span class="tag is-danger">소진</span>' : '<span class="tag is-success">가능</span>'}</td>
              <td>${h.last_applied_at ? new Date(h.last_applied_at).toLocaleString('ko-KR') : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="notification is-warning is-light">
        ⚠️ 이 사업자는 과거 프로모션 혜택을 사용했습니다. 첫 결제 전용 프로모션은 할당할 수 없습니다.
      </p>
    `;

  } catch (error) {
    console.error('프로모션 이력 조회 오류:', error);
    document.getElementById('promotionHistorySummary').innerHTML = 
      '<p class="has-text-danger">조회 실패</p>';
  }
}

/**
 * 회원 구독 상태 조회
 */
async function assignPromotionLoadUserSubscriptionStatus(userId) {
  try {
    const response = await fetch('/admin/api/users/' + userId + '/subscription-status', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const sub = data.subscription || {};
    const payments = data.payments || [];

    const summaryDiv = document.getElementById('subscriptionSummary');

    summaryDiv.innerHTML = `
      <div class="columns is-multiline">
        <div class="column is-6">
          <strong>현재 구독 상태:</strong> ${sub.status || '없음'}
        </div>
        <div class="column is-6">
          <strong>다음 결제일:</strong> ${sub.next_billing_at ? new Date(sub.next_billing_at).toLocaleString('ko-KR') : '-'}
        </div>
        <div class="column is-6">
          <strong>최근 결제 금액:</strong> ${payments.length > 0 ? payments[0].amount.toLocaleString() + '원' : '-'}
        </div>
        <div class="column is-6">
          <strong>자동결제 여부:</strong> ${sub.status === 'active' ? '<span class="tag is-success">ON</span>' : '<span class="tag is-light">OFF</span>'}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('구독 상태 조회 오류:', error);
    document.getElementById('subscriptionSummary').innerHTML = 
      '<p class="has-text-danger">조회 실패</p>';
  }
}

/**
 * 회원 예약 프로모션 조회
 */
async function assignPromotionLoadUserPendingPromotions(userId) {
  try {
    const response = await fetch('/admin/api/users/' + userId + '/pending-promotions', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const pending = data.pending || [];

    const listDiv = document.getElementById('pendingPromotionsList');

    if (pending.length === 0) {
      listDiv.innerHTML = '<p class="has-text-centered">예약된 프로모션이 없습니다</p>';
      return;
    }

    listDiv.innerHTML = `
      <table class="table is-fullwidth is-narrow">
        <thead>
          <tr>
            <th>프로모션명</th>
            <th>예약 시각</th>
            <th>상태</th>
            <th>적용 예정</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map(p => {
            let statusBadge = '';
            if (p.applied_at) {
              statusBadge = '<span class="tag is-success status-applied">적용 완료</span>';
            } else {
              statusBadge = '<span class="tag is-warning status-reserved">예약됨</span>';
            }

            return `
              <tr>
                <td>${p.promotion_name}</td>
                <td>${new Date(p.created_at).toLocaleString('ko-KR')}</td>
                <td>${statusBadge}</td>
                <td>${p.applied_at ? new Date(p.applied_at).toLocaleString('ko-KR') : '다음 결제 시'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

  } catch (error) {
    console.error('예약 프로모션 조회 오류:', error);
    document.getElementById('pendingPromotionsList').innerHTML = 
      '<p class="has-text-danger">조회 실패</p>';
  }
}

/**
 * 할당 자격 확인
 */
function assignPromotionCheckAssignmentEligibility(user) {
  const checkDiv = document.getElementById('assignmentEligibilityCheck');
  const assignButton = document.getElementById('singleAssignButton');

  if (!user.is_first_payment) {
    checkDiv.innerHTML = `
      <div class="notification is-danger is-light">
        <strong>❌ 할당 불가</strong><br>
        이 회원은 이미 결제 이력이 있거나, 과거 프로모션 혜택을 사용했습니다.<br>
        첫 결제 전용 프로모션은 할당할 수 없습니다.
      </div>
    `;
    assignButton.disabled = true;
    return;
  }

  checkDiv.innerHTML = `
    <div class="notification is-success is-light">
      <strong>✅ 할당 가능</strong><br>
      이 회원은 첫 결제 예정 고객입니다. 프로모션을 할당할 수 있습니다.
    </div>
  `;
  assignButton.disabled = false;
}

/**
 * 개별 할당 실행
 */
async function assignPromotionExecuteSingleAssign() {
  if (!promotionCurrentUserDetail) {
    alert('회원 정보를 찾을 수 없습니다.');
    return;
  }

  const promotionId = document.getElementById('singlePromotionSelect').value;
  const memo = document.getElementById('singleAssignMemo').value.trim();

  if (!promotionId) {
    alert('프로모션을 선택해주세요.');
    return;
  }

  if (!confirm(promotionCurrentUserDetail.pharmacist_name + '님에게 프로모션을 할당하시겠습니까?')) {
    return;
  }

  try {
    const response = await fetch('/admin/api/assign-promotion', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        promotion_id: promotionId,
        user_ids: [promotionCurrentUserDetail.user_id],
        memo: memo || null,
        source: 'admin_assigned'
      })
    });

    const result = await response.json();

    if (result.success) {
      alert('프로모션이 할당되었습니다.');
      assignPromotionCloseUserDetailModal();
      await assignPromotionLoadCandidates();
      await assignPromotionLoadAssignmentList();
    } else {
      alert('할당 실패: ' + (result.error || '알 수 없는 오류'));
    }

  } catch (error) {
    console.error('개별 할당 오류:', error);
    alert('할당 중 오류가 발생했습니다.');
  }
}

/**
 * 예약 관리 목록 조회 (아직 적용되지 않은 프로모션)
 */
async function assignPromotionLoadReservations() {
  try {
    const response = await fetch('/admin/api/assign-promotion/assignments', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const tbody = document.getElementById('reservationTableBody');

    if (!data.assignments || data.assignments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="has-text-centered">예약된 프로모션이 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = data.assignments.map(assign => {
      const user = assign.users || {};
      const promo = assign.subscription_promotions || {};

      let statusBadge = '<span class="tag is-warning">예약됨</span>';
      if (assign.status === 'selected') {
        statusBadge = '<span class="tag is-info">선택됨</span>';
      }

      let discountInfo = '';
      if (promo.discount_type === 'free') {
        discountInfo = promo.free_months + '개월 무료';
      } else if (promo.discount_type === 'percent') {
        discountInfo = promo.discount_value + '% 할인';
      } else if (promo.discount_type === 'amount') {
        discountInfo = promo.discount_value.toLocaleString() + '원 할인';
      }

      const sourceBadge = assign.source === 'admin_assigned' 
        ? '<span class="tag is-info">관리자</span>' 
        : (assign.source === 'referral' 
          ? '<span class="tag is-link">추천인</span>' 
          : '<span class="tag is-light">사용자</span>');

      return `
        <tr>
          <td>
            <strong>${user.pharmacy_name || '(알 수 없음)'}</strong><br>
            <small>${user.email || ''}</small>
          </td>
          <td>${promo.promotion_name || '(알 수 없음)'}<br><small>${promo.promotion_code || ''}</small></td>
          <td>${discountInfo}</td>
          <td>${new Date(assign.created_at).toLocaleString('ko-KR')}</td>
          <td>${statusBadge}</td>
          <td>${sourceBadge}</td>
          <td>
            <button class="button is-danger is-small" onclick="assignPromotionCancelReservation('${assign.pending_id}')">
              <span class="icon"><i class="fas fa-times"></i></span>
              <span>취소</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('예약 목록 조회 오류:', error);
    document.getElementById('reservationTableBody').innerHTML = 
      '<tr><td colspan="7" class="has-text-centered has-text-danger">오류가 발생했습니다</td></tr>';
  }
}

/**
 * 프로모션 적용 이력 조회 (실제 결제에 사용된 프로모션)
 */
async function assignPromotionLoadAppliedHistory() {
  try {
    const response = await fetch('/admin/api/promotion-applied-history', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();
    const tbody = document.getElementById('appliedHistoryTableBody');

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered">적용된 프로모션이 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = data.history.map(record => {
      const user = record.users || {};
      const promo = record.subscription_promotions || {};
      const payment = record.billing_payments || {};

      let discountInfo = '';
      if (promo.discount_type === 'free') {
        discountInfo = promo.free_months + '개월 무료';
      } else if (promo.discount_type === 'percent') {
        discountInfo = promo.discount_value + '% 할인';
      } else if (promo.discount_type === 'amount') {
        discountInfo = promo.discount_value.toLocaleString() + '원 할인';
      }

      const sourceBadge = record.source === 'admin_assigned' 
        ? '<span class="tag is-info">관리자</span>' 
        : (record.source === 'referral' 
          ? '<span class="tag is-link">추천인</span>' 
          : '<span class="tag is-light">사용자</span>');

      const planBadge = payment.subscription_type === 'monthly' 
        ? '<span class="tag is-light">월간</span>' 
        : '<span class="tag is-primary">연간</span>';

      return `
        <tr>
          <td>
            <strong>${user.pharmacy_name || '(알 수 없음)'}</strong><br>
            <small>${user.email || ''}</small>
          </td>
          <td>${promo.promotion_name || '(알 수 없음)'}<br><small>${promo.promotion_code || ''}</small></td>
          <td>${discountInfo}</td>
          <td>${new Date(payment.payment_date).toLocaleString('ko-KR')}</td>
          <td><strong>${payment.amount ? payment.amount.toLocaleString() : 0}원</strong></td>
          <td>${planBadge}</td>
          <td>${sourceBadge}</td>
          <td>
            <button class="button is-info is-small" onclick="openPaymentDetailModal('${user.user_id}')">
              <span class="icon"><i class="fas fa-eye"></i></span>
              <span>상세</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('적용 이력 조회 오류:', error);
    document.getElementById('appliedHistoryTableBody').innerHTML = 
      '<tr><td colspan="8" class="has-text-centered has-text-danger">오류가 발생했습니다</td></tr>';
  }
}

/**
 * 예약 취소
 */
async function assignPromotionCancelReservation(pendingId) {
  if (!confirm('이 예약을 취소하시겠습니까?\n다음 결제 시 해당 프로모션이 적용되지 않습니다.')) {
    return;
  }

  try {
    const response = await fetch('/admin/api/assign-promotion/' + pendingId, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const result = await response.json();

    if (result.success) {
      alert('예약이 취소되었습니다.');
      await assignPromotionLoadReservations();
      await assignPromotionLoadCandidates();
    } else {
      alert('취소 실패: ' + (result.error || '알 수 없는 오류'));
    }

  } catch (error) {
    console.error('예약 취소 오류:', error);
    alert('취소 중 오류가 발생했습니다.');
  }
}

/**
 * 회원별 프로모션 적용 상세 모달
 */
async function openPaymentDetailModal(userId) {
  document.getElementById('paymentDetailModal').classList.add('is-active');

  try {
    const response = await fetch('/admin/api/users/' + userId + '/promotion-applied-detail', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('admin_session_token')
      }
    });

    const data = await response.json();

    // 회원 기본 정보
    const userInfo = data.user || {};
    document.getElementById('paymentDetailUserInfo').innerHTML = `
      <div class="columns">
        <div class="column">
          <p><strong>약국명:</strong> ${userInfo.pharmacy_name || '-'}</p>
          <p><strong>약사명:</strong> ${userInfo.pharmacist_name || '-'}</p>
        </div>
        <div class="column">
          <p><strong>이메일:</strong> ${userInfo.email || '-'}</p>
          <p><strong>사업자번호:</strong> ${userInfo.business_number || '-'}</p>
        </div>
      </div>
    `;

    // 구독 상태
    const subscription = data.subscription || {};
    const nextAmount = data.next_payment_amount || 0;
    document.getElementById('paymentDetailSubscription').innerHTML = `
      <div class="columns">
        <div class="column">
          <p><strong>구독 플랜:</strong> ${subscription.subscription_type === 'yearly' ? '연간' : '월간'}</p>
          <p><strong>다음 결제일:</strong> ${subscription.next_billing_at ? new Date(subscription.next_billing_at).toLocaleDateString('ko-KR') : '-'}</p>
        </div>
        <div class="column">
          <p><strong>다음 결제 예정 금액:</strong> <span class="tag is-success is-large">${nextAmount.toLocaleString()}원</span></p>
          <p><small>${nextAmount === 0 ? '프로모션이 적용된 무료 결제입니다' : ''}</small></p>
        </div>
      </div>
    `;

    // 프로모션 적용 결제 이력
    const payments = data.payments || [];
    if (payments.length === 0) {
      document.getElementById('paymentDetailHistory').innerHTML = 
        '<p class="has-text-centered">프로모션이 적용된 결제 이력이 없습니다</p>';
    } else {
      document.getElementById('paymentDetailHistory').innerHTML = `
        <table class="table is-fullwidth is-narrow">
          <thead>
            <tr>
              <th>결제일</th>
              <th>프로모션</th>
              <th>할인 정보</th>
              <th>결제 금액</th>
              <th>플랜</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(p => {
              const promo = p.subscription_promotions || {};
              let discountInfo = '';
              if (promo.discount_type === 'free') {
                discountInfo = promo.free_months + '개월 무료';
              } else if (promo.discount_type === 'percent') {
                discountInfo = promo.discount_value + '% 할인';
              } else if (promo.discount_type === 'amount') {
                discountInfo = promo.discount_value.toLocaleString() + '원 할인';
              }

              return `
                <tr>
                  <td>${new Date(p.payment_date).toLocaleDateString('ko-KR')}</td>
                  <td>${promo.promotion_name || '(알 수 없음)'}<br><small>${promo.promotion_code || ''}</small></td>
                  <td>${discountInfo}</td>
                  <td><strong>${p.amount ? p.amount.toLocaleString() : 0}원</strong></td>
                  <td>${p.subscription_type === 'yearly' ? '연간' : '월간'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

  } catch (error) {
    console.error('회원 상세 조회 오류:', error);
    document.getElementById('paymentDetailUserInfo').innerHTML = 
      '<p class="has-text-centered has-text-danger">오류가 발생했습니다</p>';
  }
}

/**
 * 회원별 상세 모달 닫기
 */
function closePaymentDetailModal() {
  document.getElementById('paymentDetailModal').classList.remove('is-active');
}

/**
 * 레거시 함수 (호환성 유지)
 */
async function assignPromotionLoadAssignmentList() {
  await assignPromotionLoadReservations();
}
