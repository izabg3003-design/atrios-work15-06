import { supabase } from './lib/supabase';

async function testIntercept() {
  console.log("Checking app_banners table in the database...");
  try {
    const { data, error } = await supabase.from('app_banners').select('*').limit(3);
    if (error) {
      console.error("Error with app_banners:", error);
    } else {
      console.log("app_banners table exists! Samples:", data);
    }
  } catch (err: any) {
    console.error("Test threw error:", err);
  }
}

testIntercept();

