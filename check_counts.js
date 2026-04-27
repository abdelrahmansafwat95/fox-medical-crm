const { createClient } = require('@supabase/supabase-client');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: pendingCount } = await supabase.from('visits').select('id', { count: 'exact', head: true }).eq('manager_status', 'pending');
  const { count: flaggedCount } = await supabase.from('visits').select('id', { count: 'exact', head: true }).eq('manager_status', 'flagged');
  console.log('Pending Visits:', pendingCount);
  console.log('Flagged Visits:', flaggedCount);
}
check();
