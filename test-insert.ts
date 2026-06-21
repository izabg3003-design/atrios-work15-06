import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log('--- TESTING INSERT ---');
  const payload = {
    title: '[DEVICE_SUB]_test_device_id',
    highlight: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
    subtitle: JSON.stringify({ endpoint: 'test-endpoint', keys: { auth: 'auth', p256dh: 'p256dh' } }),
    cta_text: 'test_user',
    cta_link: 'free||user_type:push_notification',
    theme_color: 'purple',
    is_active: true
  };

  const { data, error } = await supabase.from('app_banners').insert([payload]).select();
  if (error) {
    console.error('Insert error details:', error);
  } else {
    console.log('Insert success!', data);
  }
  console.log('--- END TESTING INSERT ---');
}

testInsert();
