import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRecipients() {
  console.log("Checking ALL profiles...");
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role, fcm_token, name, created_at');

  if (error) {
    console.error("Error fetching profiles:", error);
  } else {
    console.log("Total profiles found:", profiles?.length);
    profiles?.forEach(p => {
      console.log(`- ID: ${p.id}, Email: ${p.email}, Name: ${p.name}, Role: ${p.role}, Token: ${p.fcm_token ? p.fcm_token.substring(0, 30) + '...' : 'NULL'}`);
    });
  }
}

testRecipients();
