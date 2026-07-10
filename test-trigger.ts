import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  console.log("Testing insert into support_tickets...");
  const tempUserId = 'cc8e238c-dc84-493c-a86e-a7abc4da6dbd';
  
  const { data: ticketData, error: ticketErr } = await supabase
    .from('support_tickets')
    .insert({
      user_id: tempUserId,
      status: 'open',
      last_message: 'TESTE DE TRIGGER DIRECTO NO SUPABASE',
      updated_at: new Date().toISOString()
    })
    .select();

  if (ticketErr) {
    console.error("❌ Support Ticket insert failed with error:", ticketErr);
  } else {
    console.log("✅ Support Ticket insert SUCCEEDED! Data:", ticketData);
  }

  console.log("Testing insert into chat_messages...");
  const { data: msgData, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      user_id: tempUserId,
      text: 'TESTE DE MSG DIRECTA NO SUPABASE',
      sender_role: 'user'
    })
    .select();

  if (msgErr) {
    console.error("❌ Chat Message insert failed with error:", msgErr);
  } else {
    console.log("✅ Chat Message insert SUCCEEDED! Data:", msgData);
  }
}

runTest();
