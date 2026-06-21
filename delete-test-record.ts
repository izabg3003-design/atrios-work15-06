import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUp() {
  console.log('--- CLEANING UP ---');
  const { data, error } = await supabase.from('app_banners').delete().eq('title', '[DEVICE_SUB]_test_device_id');
  if (error) {
    console.error('Delete error:', error);
  } else {
    console.log('Test record cleaned successfully from database.');
  }
}

cleanUp();
