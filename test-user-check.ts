import { supabase } from './lib/supabase';

async function checkUser() {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', 'jefersongoes36@gmail.com').single();
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Profile Data for jefersongoes36@gmail.com:");
    console.log(JSON.stringify(data, null, 2));
  }
}

checkUser();
