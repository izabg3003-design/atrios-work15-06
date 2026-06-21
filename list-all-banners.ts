import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllBanners() {
  const { data, error } = await supabase.from('app_banners').select('*');
  if (error) {
    console.error('Error fetching banners:', error);
    return;
  }
  
  console.log(`Total banners found: ${data ? data.length : 0}`);
  if (data) {
    data.forEach((b: any, index: number) => {
      console.log(`[${index}] Title: "${b.title}", Active: ${b.is_active}, Highlight: "${b.highlight}", CTA_text: "${b.cta_text}", CTA_link: "${b.cta_link}"`);
    });
  }
}

listAllBanners();
