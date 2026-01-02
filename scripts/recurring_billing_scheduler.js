/**
 * PharmChecker 자동결제 스케줄러
 * 
 * 실행 시각: 매일 오전 1시 (구독 종료일 다음날)
 * 기능: current_period_end가 지난 active 구독을 자동 결제
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const got = require('got');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

/**
 * 구독 기간 계산 (시분초 제거, 자정~23:59:59)
 */
function calculateNextPeriod(currentEndDate) {
  const prevEnd = new Date(currentEndDate);
  
  // 시작일: 이전 종료일의 다음날 자정
  const newPeriodStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1, 0, 0, 0, 0);
  
  // 종료일: 다음달 같은 날짜 23:59:59 (월말 처리 포함)
  const nextMonth = new Date(newPeriodStart.getFullYear(), newPeriodStart.getMonth() + 1, newPeriodStart.getDate(), 23, 59, 59, 999);
  
  // 월말 처리: 1/31 → 2/28(29), 3/31 → 4/30
  if (nextMonth.getDate() !== newPeriodStart.getDate()) {
    nextMonth.setDate(0); // 이전 달 마지막날
    nextMonth.setHours(23, 59, 59, 999);
  }
  
  return {
    start: newPeriodStart,
    end: nextMonth
  };
}

/**
 * 구독 기간 동안의 사용량 집계 및 저장
 */
async function aggregateUsageForPeriod(subscription) {
  const periodStart = subscription.current_period_start.split('T')[0]; // 'YYYY-MM-DD'
  const periodEnd = subscription.current_period_end.split('T')[0];
  
  console.log(`  사용량 집계 중: ${periodStart} ~ ${periodEnd}`);
  
  try {
    // 1. usage_daily_stats에서 해당 기간의 일별 사용량 조회
    const { data: dailyStats, error: statsError } = await supabase
      .from('usage_daily_stats')
      .select('rx_count')
      .eq('user_id', subscription.user_id)
      .gte('usage_date', periodStart)
      .lte('usage_date', periodEnd);
    
    if (statsError) {
      console.error('  일별 사용량 조회 실패:', statsError);
      return 0;
    }
    
    // 2. 총 사용량 합산
    const totalRxCount = dailyStats?.reduce((sum, stat) => sum + stat.rx_count, 0) || 0;
    
    console.log(`  총 사용량: ${totalRxCount}건 (${dailyStats?.length || 0}일 집계)`);
    
    // 3. usage_billing_period_stats에 저장 (중복 방지: UPSERT)
    const { error: upsertError } = await supabase
      .from('usage_billing_period_stats')
      .upsert({
        subscription_id: subscription.subscription_id,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
        total_rx_count: totalRxCount,
        calculated_at: new Date().toISOString()
      }, {
        onConflict: 'subscription_id,period_start'
      });
    
    if (upsertError) {
      console.error('  사용량 집계 저장 실패:', upsertError);
    } else {
      console.log('  사용량 집계 저장 완료 ✓');
    }
    
    return totalRxCount;
    
  } catch (error) {
    console.error('  사용량 집계 오류:', error);
    return 0;
  }
}

/**
 * 사용량 기반 플랜 자동 결정
 */
async function determineOptimalPlan(subscriptionId, periodStart) {
  // 이번 결제 주기 사용량 조회
  const { data: usageStats } = await supabase
    .from('usage_billing_period_stats')
    .select('total_rx_count')
    .eq('subscription_id', subscriptionId)
    .eq('period_start', periodStart)
    .single();

  const totalRxCount = usageStats?.total_rx_count || 0;

  // 모든 활성 플랜 조회 (가격 오름차순)
  const { data: allPlans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('monthly_price', { ascending: true });

  let selectedPlan = allPlans[0]; // 기본값: 가장 저렴한 플랜

  // 사용량에 맞는 최적 플랜 찾기
  for (const plan of allPlans) {
    if (plan.daily_rx_limit === null || plan.daily_rx_limit >= 999999) {
      // 무제한 플랜
      selectedPlan = plan;
      break;
    } else if (totalRxCount <= plan.daily_rx_limit * 30) {
      // 월간 사용량이 플랜 한도 안에 들어오면 선택
      selectedPlan = plan;
      break;
    }
  }

  return { selectedPlan, totalRxCount };
}

/**
 * 토스 페이먼츠 자동결제 실행
 * 프로모션 적용된 금액 계산 포함
 */
async function executeRecurringPayment(subscription, paymentMethod, plan, userId) {
  const encryptedSecretKey = "Basic " + Buffer.from(TOSS_SECRET_KEY + ":").toString("base64");
  const orderId = 'REC_' + userId.substring(0, 8) + '_' + Date.now();
  
  try {
    // 프로모션 적용 금액 계산
    let billingAmount = plan.monthly_price;
    let orderName = `PharmChecker ${plan.plan_name} 플랜 (정기결제)`;

    // 프로모션이 적용되어 있는지 확인
    if (subscription.promotion_id && subscription.promotion_expires_at) {
      const now = new Date();
      const expiresAt = new Date(subscription.promotion_expires_at);

      // 프로모션 기간이 아직 유효한지 확인
      if (now < expiresAt) {
        // 프로모션 정보 조회
        const { data: promotion } = await supabase
          .from('subscription_promotions')
          .select('*')
          .eq('promotion_id', subscription.promotion_id)
          .single();

        if (promotion && promotion.is_active) {
          console.log(`  프로모션 적용 중: ${promotion.promotion_name}`);
          
          if (promotion.discount_type === 'free') {
            billingAmount = 0;
            orderName = `PharmChecker ${plan.plan_name} 플랜 (무료 프로모션)`;
            console.log('  → 0원 결제 (무료)');
          } else if (promotion.discount_type === 'percent' && promotion.discount_value) {
            billingAmount = Math.round(billingAmount * (1 - promotion.discount_value / 100));
            orderName = `PharmChecker ${plan.plan_name} 플랜 (${promotion.discount_value}% 할인)`;
            console.log(`  → ${promotion.discount_value}% 할인: ${billingAmount}원`);
          } else if (promotion.discount_type === 'amount' && promotion.discount_value) {
            billingAmount = Math.max(0, billingAmount - promotion.discount_value);
            orderName = `PharmChecker ${plan.plan_name} 플랜 (${promotion.discount_value}원 할인)`;
            console.log(`  → ${promotion.discount_value}원 할인: ${billingAmount}원`);
          }
        }
      } else {
        console.log(`  프로모션 만료됨: ${subscription.promotion_expires_at}`);
      }
    }

    // 💡 0원 결제는 토스 API 호출 생략 (무료 프로모션 기간)
    if (billingAmount === 0) {
      console.log('  → 0원 결제: 토스 API 호출 생략 (무료 프로모션 계속)');
      return {
        success: true,
        payment: {
          paymentKey: 'FREE_' + orderId,
          orderId: orderId,
          amount: 0,
          status: 'DONE'
        },
        orderId,
        amount: 0,
        isFree: true  // 무료 결제 플래그
      };
    }

    // 유료 결제: 토스 API 호출
    const paymentResponse = await got.post(`https://api.tosspayments.com/v1/billing/${paymentMethod.billing_key}`, {
      headers: {
        Authorization: encryptedSecretKey,
        "Content-Type": "application/json",
      },
      json: {
        customerKey: subscription.customer_key,
        amount: billingAmount,  // 프로모션 적용된 금액
        orderId: orderId,
        orderName: orderName,
        customerEmail: '',
        customerName: '',
      },
      responseType: "json",
    });

    return {
      success: true,
      payment: paymentResponse.body,
      orderId,
      amount: billingAmount,  // 실제 청구 금액 반환
      isFree: false
    };
  } catch (error) {
    console.error(`결제 실패 [${userId}]:`, error.response?.body || error.message);
    return {
      success: false,
      error: error.response?.body || error,
      orderId
    };
  }
}

/**
 * 무료 기간 종료 → 첫 유료 결제 처리
 * current_period_start IS NULL AND next_billing_at <= NOW()
 */
async function handleFreeTrialExpiration() {
  console.log('\n----- 무료 기간 종료 처리 -----');
  
  const now = new Date();
  
  try {
    // 1. 무료 기간이 종료된 구독 조회
    const { data: freeExpiredSubs, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('*, payment_methods!inner(*)')
      .is('current_period_start', null)  // 무료 기간 (결제 주기 미시작)
      .lte('next_billing_at', now.toISOString())
      .eq('status', 'active');
    
    if (queryError) {
      console.error('무료 종료 구독 조회 실패:', queryError);
      return;
    }
    
    if (!freeExpiredSubs || freeExpiredSubs.length === 0) {
      console.log('무료 종료 구독 없음');
      return;
    }
    
    console.log(`무료 종료 대상: ${freeExpiredSubs.length}건`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const sub of freeExpiredSubs) {
      try {
        console.log(`\n무료 → 유료 전환: ${sub.user_id}`);
        console.log(`  무료 종료 시각: ${sub.next_billing_at}`);
        
        // 2. 플랜 정보 조회
        const { data: plan } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('plan_id', sub.billing_plan_id)
          .single();
        
        if (!plan) {
          console.error('  플랜 정보 없음');
          failCount++;
          continue;
        }
        
        // 3. 결제수단 조회
        const paymentMethod = sub.payment_methods;
        
        if (!paymentMethod || !paymentMethod.billing_key) {
          console.error('  결제수단 없음');
          failCount++;
          continue;
        }
        
        // 4. 첫 유료 결제 실행
        const paymentResult = await executeRecurringPayment(sub, paymentMethod, plan, sub.user_id);
        
        if (paymentResult.success && !paymentResult.isFree) {
          // 5. 결제 성공 - billing_payments 저장
          await supabase
            .from('billing_payments')
            .insert({
              payment_id: uuidv4(),
              subscription_id: sub.subscription_id,
              user_id: sub.user_id,
              order_id: paymentResult.orderId,
              payment_key: paymentResult.payment.paymentKey,
              billing_key: paymentMethod.billing_key,
              payment_method_id: paymentMethod.payment_method_id,
              amount: paymentResult.amount,
              status: 'success',
              requested_at: new Date().toISOString(),
              approved_at: new Date().toISOString(),
            });
          
          // 6. 첫 유료 주기 시작 - current_period 설정
          const firstPaidStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          const firstPaidEnd = new Date(firstPaidStart.getFullYear(), firstPaidStart.getMonth() + 1, firstPaidStart.getDate(), 23, 59, 59, 999);
          
          // 월말 처리
          if (firstPaidEnd.getDate() !== firstPaidStart.getDate()) {
            firstPaidEnd.setDate(0);
            firstPaidEnd.setHours(23, 59, 59, 999);
          }
          
          await supabase
            .from('user_subscriptions')
            .update({
              current_period_start: firstPaidStart.toISOString(),
              current_period_end: firstPaidEnd.toISOString(),
              next_billing_at: firstPaidEnd.toISOString(),
              is_first_billing: false,  // 첫 유료 결제 완료
              promotion_id: null,       // 프로모션 종료
              promotion_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', sub.subscription_id);
          
          console.log(`✅ 첫 유료 결제 성공: ${paymentResult.amount}원`);
          console.log(`   유료 주기: ${firstPaidStart.toISOString()} ~ ${firstPaidEnd.toISOString()}`);
          successCount++;
          
        } else {
          // 7. 결제 실패 - 유예기간 설정
          const failedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          const graceUntil = new Date(failedAt);
          graceUntil.setDate(graceUntil.getDate() + 7);
          graceUntil.setHours(23, 59, 59, 999);
          
          await supabase
            .from('user_subscriptions')
            .update({
              status: 'payment_failed',
              failed_at: failedAt.toISOString(),
              grace_until: graceUntil.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', sub.subscription_id);
          
          // 실패 기록 저장
          await supabase
            .from('billing_payments')
            .insert({
              payment_id: uuidv4(),
              subscription_id: sub.subscription_id,
              user_id: sub.user_id,
              order_id: paymentResult.orderId,
              billing_key: paymentMethod.billing_key,
              payment_method_id: paymentMethod.payment_method_id,
              amount: plan.monthly_price,
              status: 'failed',
              fail_reason: paymentResult.error?.message || '알 수 없는 오류',
              requested_at: new Date().toISOString(),
            });
          
          console.error(`❌ 첫 유료 결제 실패: ${paymentResult.error?.message}`);
          console.error(`   유예기간: ${graceUntil.toISOString()}까지`);
          failCount++;
        }
        
      } catch (error) {
        console.error(`처리 중 오류:`, error);
        failCount++;
      }
    }
    
    console.log(`\n무료 → 유료 전환 완료: 성공 ${successCount}건 / 실패 ${failCount}건`);
    
  } catch (error) {
    console.error('무료 종료 처리 오류:', error);
  }
}

/**
 * 유예가간 만료 처리 (payment_failed → restricted → suspended)
 */
async function handleExpiredGracePeriods() {
  console.log('\n----- 유예기간 만료 처리 -----');
  
  const now = new Date();
  
  try {
    // 1. payment_failed 상태에서 유예기간 만료된 구독 조회
    const { data: expiredSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('subscription_id, user_id, status, grace_until')
      .eq('status', 'payment_failed')
      .lt('grace_until', now.toISOString());
    
    if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
      console.log('유예기간 만료된 구독 없음');
      return;
    }
    
    console.log(`유예기간 만료: ${expiredSubscriptions.length}건`);
    
    // 2. payment_failed → restricted (핵심 기능 제한)
    for (const sub of expiredSubscriptions) {
      await supabase
        .from('user_subscriptions')
        .update({
          status: 'restricted',
          updated_at: new Date().toISOString(),
        })
        .eq('subscription_id', sub.subscription_id);
      
      console.log(`  ${sub.user_id}: payment_failed → restricted`);
    }
    
    // 3. restricted → suspended (일자 기준 7일 경과 시)
    // grace_until 기준: grace_until + 7일 후 23:59:59 경과 시
    const { data: restrictedSubscriptions } = await supabase
      .from('user_subscriptions')
      .select('subscription_id, user_id, grace_until')
      .eq('status', 'restricted');
    
    if (restrictedSubscriptions && restrictedSubscriptions.length > 0) {
      const toSuspend = restrictedSubscriptions.filter(sub => {
        if (!sub.grace_until) return false;
        
        // grace_until + 7일 계산
        const graceEnd = new Date(sub.grace_until);
        const suspendDeadline = new Date(graceEnd);
        suspendDeadline.setDate(suspendDeadline.getDate() + 7);
        suspendDeadline.setHours(23, 59, 59, 999);
        
        return now >= suspendDeadline;
      });
      
      if (toSuspend.length > 0) {
        console.log(`\nrestricted → suspended: ${toSuspend.length}건`);
        
        for (const sub of toSuspend) {
          await supabase
            .from('user_subscriptions')
            .update({
              status: 'suspended',
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', sub.subscription_id);
          
          console.log(`  ${sub.user_id}: restricted → suspended`);
        }
      }
    }
    
  } catch (error) {
    console.error('유예기간 처리 오류:', error);
  }
}

/**
 * 해지 예약된 구독 처리
 * cancel_at_period_end = true이고 current_period_end가 지난 구독을 종료
 */
async function handleCancelledSubscriptions() {
  console.log('\n===== 해지 예약 구독 처리 =====');
  
  try {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 59, 59, 999);
    
    // 해지 예약되고 청구기간이 종료된 구독 조회
    const { data: cancelledSubs, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('cancel_at_period_end', true)
      .lte('current_period_end', yesterday.toISOString());
    
    if (error) {
      console.error('해지 예약 구독 조회 실패:', error);
      return;
    }
    
    if (!cancelledSubs || cancelledSubs.length === 0) {
      console.log('해지 처리할 구독 없음');
      return;
    }
    
    console.log(`해지 처리 대상: ${cancelledSubs.length}건`);
    
    for (const sub of cancelledSubs) {
      try {
        console.log(`\n구독 해지 처리: ${sub.user_id}`);
        console.log(`  구독 ID: ${sub.subscription_id}`);
        console.log(`  청구기간 종료: ${sub.current_period_end}`);
        
        // 구독 상태를 'cancelled'로 변경
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('subscription_id', sub.subscription_id);
        
        if (updateError) {
          console.error(`  해지 처리 실패:`, updateError);
        } else {
          console.log(`  ✅ 해지 완료`);
        }
        
      } catch (error) {
        console.error(`  해지 처리 중 오류:`, error);
      }
    }
    
    console.log(`\n해지 처리 완료: ${cancelledSubs.length}건`);
    
  } catch (error) {
    console.error('해지 구독 처리 오류:', error);
  }
}

/**
 * 메인 스케줄러 실행 함수
 */
async function runRecurringBillingScheduler() {
  console.log('\n========================================');
  console.log('자동결제 스케줄러 시작:', new Date().toISOString());
  console.log('========================================\n');

  try {
    // ===== 1단계: 무료 기간 종료 → 첫 유료 결제 =====
    await handleFreeTrialExpiration();

    // ===== 2단계: 유예기간 만료 처리 (payment_failed → restricted → suspended) =====
    await handleExpiredGracePeriods();

    // ===== 3단계: 해지 예약 처리 =====
    await handleCancelledSubscriptions();

    // ===== 4단계: 정기 결제 처리 (유료 구독만) =====
    // 오늘 자정 (오전 1시 실행이므로 어제 날짜의 23:59:59가 종료일)
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 59, 59, 999);

    console.log('\n----- 정기 결제 처리 -----');
    console.log('결제 대상 조회 기준 시각:', yesterday.toISOString());

    // current_period_end가 어제 자정(23:59:59) 이하인 active 구독 조회
    // ⚠️ current_period_start IS NOT NULL = 이미 유료 주기 시작된 구독만
    const { data: subscriptions, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)  // 해지 예약된 구독 제외
      .not('current_period_start', 'is', null)  // ⚠️ 무료 기간 제외
      .lte('current_period_end', yesterday.toISOString());

    if (error) {
      throw error;
    }

    console.log(`결제 대상 구독: ${subscriptions?.length || 0}건\n`);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('결제할 구독이 없습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // 각 구독에 대해 자동결제 실행
    for (const subscription of subscriptions) {
      console.log(`\n----- 처리 중: ${subscription.user_id} -----`);

      try {
        // 1. 결제수단 조회
        const { data: paymentMethod } = await supabase
          .from('payment_methods')
          .select('*')
          .eq('payment_method_id', subscription.payment_method_id)
          .is('disabled_at', null)
          .single();

        if (!paymentMethod) {
          console.error('유효한 결제수단 없음');
          failCount++;
          continue;
        }

        // 2. 지난 한 달 사용량 집계 및 저장
        const aggregatedUsage = await aggregateUsageForPeriod(subscription);

        // 3. 사용량 기반 플랜 자동 결정
        const { selectedPlan, totalRxCount } = await determineOptimalPlan(
          subscription.subscription_id,
          subscription.current_period_start
        );

        console.log(`사용량: ${totalRxCount}건 → 플랜: ${selectedPlan.plan_name} (${selectedPlan.monthly_price}원)`);

        // 4. 자동결제 실행
        const paymentResult = await executeRecurringPayment(
          subscription,
          paymentMethod,
          selectedPlan,
          subscription.user_id
        );

        if (paymentResult.success) {
          // 5. 결제 기록 저장 (0원은 free_grants, 유료는 billing_payments)
          if (paymentResult.isFree) {
            // 무료 프로모션: subscription_free_grants에 저장
            const { data: promotion } = await supabase
              .from('subscription_promotions')
              .select('free_months')
              .eq('promotion_id', subscription.promotion_id)
              .single();

            await supabase
              .from('subscription_free_grants')
              .insert({
                free_grant_id: uuidv4(),
                user_id: subscription.user_id,
                subscription_id: subscription.subscription_id,
                promotion_id: subscription.promotion_id,
                referral_code_id: null,  // 정기결제는 추천인 코드 없음
                free_months: promotion?.free_months || 1,
                granted_at: new Date().toISOString(),
                effective_start: subscription.current_period_start,
                effective_end: subscription.current_period_end,
              });

            console.log('  → 무료 프로모션 부여 기록 저장');
          } else {
            // 유료 결제: billing_payments에 저장
            await supabase
              .from('billing_payments')
              .insert({
                payment_id: uuidv4(),
                subscription_id: subscription.subscription_id,
                user_id: subscription.user_id,
                order_id: paymentResult.orderId,
                payment_key: paymentResult.payment.paymentKey,
                billing_key: paymentMethod.billing_key,
                payment_method_id: paymentMethod.payment_method_id,
                amount: paymentResult.amount,  // 실제 청구 금액
                status: 'success',
                requested_at: new Date().toISOString(),
                approved_at: new Date().toISOString(),
              });

            console.log(`  → 유료 결제 기록 저장 (${paymentResult.amount}원)`);
          }

          // 6. 구독 기간 갱신
          const newPeriod = calculateNextPeriod(subscription.current_period_end);

          await supabase
            .from('user_subscriptions')
            .update({
              billing_plan_id: selectedPlan.plan_id,
              current_period_start: newPeriod.start.toISOString(),
              current_period_end: newPeriod.end.toISOString(),
              next_billing_at: newPeriod.end.toISOString(),  // ⚠️ 다음 결제 예정일 갱신
              is_first_billing: false,
              failed_at: null,  // 실패 기록 초기화
              grace_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', subscription.subscription_id);

          console.log(`✅ 결제 성공: ${paymentResult.amount}원${paymentResult.isFree ? ' (무료 프로모션)' : ''}`);
          console.log(`   다음 결제일: ${newPeriod.end.toISOString()}`);
          successCount++;

        } else {
          // 7. 결제 실패 - 7일 유예기간 설정 (일자 기준)
          const now = new Date();
          
          // failed_at: 실패한 날의 자정 (00:00:00)
          const failedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          
          // grace_until: 실패일 + 7일의 마지막 순간 (23:59:59)
          const graceUntil = new Date(failedAt);
          graceUntil.setDate(graceUntil.getDate() + 7);
          graceUntil.setHours(23, 59, 59, 999);

          await supabase
            .from('user_subscriptions')
            .update({
              status: 'payment_failed',  // 결제 실패 상태 (7일 유예)
              failed_at: failedAt.toISOString(),
              grace_until: graceUntil.toISOString(),  // 7일 후 23:59:59
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', subscription.subscription_id);

          // 실패 기록 저장
          await supabase
            .from('billing_payments')
            .insert({
              payment_id: uuidv4(),
              subscription_id: subscription.subscription_id,
              user_id: subscription.user_id,
              order_id: paymentResult.orderId,
              billing_key: paymentMethod.billing_key,
              payment_method_id: paymentMethod.payment_method_id,
              amount: paymentResult.amount || selectedPlan.monthly_price,  // 실패한 요청 금액
              status: 'failed',
              fail_reason: paymentResult.error?.message || '알 수 없는 오류',
              requested_at: new Date().toISOString(),
            });

          console.error(`❌ 결제 실패: ${paymentResult.error?.message}`);
          console.error(`   유예기간: ${graceUntil.toISOString()}까지`);
          failCount++;
        }

      } catch (error) {
        console.error(`처리 중 오류:`, error);
        failCount++;
      }
    }

    console.log('\n========================================');
    console.log('자동결제 스케줄러 완료');
    console.log(`성공: ${successCount}건 / 실패: ${failCount}건`);
    console.log('========================================\n');

  } catch (error) {
    console.error('스케줄러 실행 오류:', error);
    throw error;
  }
}

// 직접 실행 시
if (require.main === module) {
  runRecurringBillingScheduler()
    .then(() => {
      console.log('스케줄러 종료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('스케줄러 에러:', error);
      process.exit(1);
    });
}

module.exports = { runRecurringBillingScheduler };
