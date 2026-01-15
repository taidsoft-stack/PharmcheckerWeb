const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSubscriptions() {
  console.log('=== 구독 현황 테스트 ===\n');
  
  // 1. 전체 구독 조회
  const { data: allSubs, error: allError } = await supabaseAdmin
    .from('user_subscriptions')
    .select(`
      subscription_id,
      user_id,
      status,
      billing_plan_id,
      created_at
    `)
    .order('created_at', { ascending: false });
  
  console.log('1. 전체 구독 개수:', allSubs?.length || 0);
  if (allError) console.error('   에러:', allError);
  
  if (allSubs && allSubs.length > 0) {
    console.log('\n구독 목록:');
    for (const sub of allSubs) {
      // 플랜 정보
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('plan_name, monthly_price')
        .eq('plan_id', sub.billing_plan_id)
        .single();
      
      // 회원 정보
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('pharmacy_name, pharmacist_name')
        .eq('user_id', sub.user_id)
        .single();
      
      // 실제 결제 금액 조회
      const { data: payments } = await supabaseAdmin
        .from('billing_payments')
        .select('amount, status, approved_at')
        .eq('user_id', sub.user_id)
        .order('approved_at', { ascending: false })
        .limit(1);
      
      console.log('\n-', {
        약국: user?.pharmacy_name || '알 수 없음',
        약사: user?.pharmacist_name || '알 수 없음',
        상태: sub.status,
        플랜: plan?.plan_name || '알 수 없음',
        '플랜 월요금': plan?.monthly_price || 0,
        '최근 결제금액': payments?.[0]?.amount || 0,
        '결제 상태': payments?.[0]?.status || '없음'
      });
    }
  }
  
  console.log('\n=== 테스트 완료 ===');
}

testSubscriptions().catch(console.error);
