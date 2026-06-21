import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDevices() {
  const { data, error } = await supabase.from('app_banners').select('*');
  if (error) {
    console.error('Error fetching:', error);
    return;
  }
  
  const devices = (data || []).filter((r: any) => r.title && r.title.startsWith('[DEVICE_SUB]'));
  console.log(`Found ${devices.length} registered devices in Supabase:`);
  for (const d of devices) {
    console.log(`- Device ID: ${d.title}, User: ${d.cta_text}, Pro: ${d.cta_link}, Updated: ${d.created_at}`);
  }
}

inspectDevices();
