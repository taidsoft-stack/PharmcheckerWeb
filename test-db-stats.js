const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testStats() {
  console.log('=== 데이터베이스 통계 테스트 ===\n');
  
  // 1. 전체 회원 수
  const { data: users, count: totalUsers, error: usersError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: false })
    .eq('is_deleted', false);
  
  console.log('1. 전체 회원 수:', totalUsers);
  if (usersError) console.error('   에러:', usersError);
  if (users && users.length > 0) {
    console.log('   샘플 사용자:', users.slice(0, 3).map(u => ({ id: u.user_id, name: u.name, email: u.email })));
  }
  
  // 2. 활성 구독 수
  const { data: subs, count: activeSubscriptions, error: subsError } = await supabase
    .from('user_subscriptions')
    .select('*', { count: 'exact', head: false })
    .eq('status', 'active');
  
  console.log('\n2. 활성 구독 수:', activeSubscriptions);
  if (subsError) console.error('   에러:', subsError);
  if (subs && subs.length > 0) {
    console.log('   샘플 구독:', subs.slice(0, 3).map(s => ({ id: s.id, user_id: s.user_id, plan: s.plan_type })));
  }
  
  // 3. 이번 달 매출
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const { data: payments, error: paymentsError } = await supabase
    .from('billing_payments')
    .select('amount')
    .eq('status', 'success')
    .gte('approved_at', startOfMonth.toISOString());
  
  const monthlyRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  
  console.log('\n3. 이번 달 매출:', monthlyRevenue, '원');
  if (paymentsError) console.error('   에러:', paymentsError);
  if (payments && payments.length > 0) {
    console.log('   결제 건수:', payments.length);
  }
  
  // 4. 활성 프로모션 수
  const { data: promos, count: activePromotions, error: promosError } = await supabase
    .from('subscription_promotions')
    .select('*', { count: 'exact', head: false })
    .eq('is_active', true);
  
  console.log('\n4. 활성 프로모션 수:', activePromotions);
  if (promosError) console.error('   에러:', promosError);
  if (promos && promos.length > 0) {
    console.log('   샘플 프로모션:', promos.slice(0, 3).map(p => ({ id: p.id, title: p.title })));
  }
  
  console.log('\n=== 테스트 완료 ===');
}

testStats().catch(console.error);
