import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSelects() {
  console.log("Testing SELECT queries...");
  
  const { data: banners, error: errBanners } = await supabase.from('app_banners').select('*').limit(1);
  console.log("app_banners select:", banners ? "SUCCESS" : "FAILED", errBanners);

  const { data: tickets, error: errTickets } = await supabase.from('support_tickets').select('*').limit(1);
  console.log("support_tickets select:", tickets ? "SUCCESS" : "FAILED", errTickets);

  const { data: messages, error: errMessages } = await supabase.from('chat_messages').select('*').limit(1);
  console.log("chat_messages select:", messages ? "SUCCESS" : "FAILED", errMessages);
}

testSelects();
