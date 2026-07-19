import { supabase } from './lib/supabase';

async function testIntercept() {
  console.log("Inspecting all profiles in the database...");
  try {
    const { data: bData, error: bErr } = await supabase.from('app_banners').select('*');
    if (bErr) {
      console.error("Error fetching app_banners:", bErr);
    } else {
      console.log("app_banners list count:", bData?.length);
      bData?.slice(0, 5).forEach(b => {
        console.log(`- Banner: ${b.title} | User type: ${b.user_type} | Is active: ${b.is_active}`);
      });
    }
  } catch (err: any) {
    console.error("Test threw error:", err);
  }
}

testIntercept();

