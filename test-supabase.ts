import { supabase } from './lib/supabase';

async function testIntercept() {
  console.log("Inspecting all profiles in the database...");
  try {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) {
      console.error("Error:", error);
    } else {
      console.log("Profiles list:");
      data.forEach(p => {
        console.log(`- ${p.name} (${p.email}) | Role: ${p.role} | Status: ${p.status} | Sub: ${JSON.stringify(p.subscription)}`);
      });
    }
  } catch (err: any) {
    console.error("Test threw error:", err);
  }
}

testIntercept();

