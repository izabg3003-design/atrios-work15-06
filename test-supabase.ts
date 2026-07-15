import { supabase } from './lib/supabase';

async function testIntercept() {
  console.log("Testing supabase functions interceptor...");
  try {
    const { data, error } = await supabase.functions.invoke('send-fcm-push', {
      body: { title: 'Test', body: 'Hello', audience: 'all' }
    });
    console.log("Result:", { data, error: error?.message });
  } catch (err: any) {
    console.error("Test threw error:", err);
  }
}

testIntercept();
