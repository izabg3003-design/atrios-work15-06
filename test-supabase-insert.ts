import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  const bannerData = {
    title: 'Teste de Inserção',
    highlight: 'Destaque teste',
    subtitle: 'Subtítulo teste',
    cta_text: 'CTA teste',
    cta_link: 'https://teste.com',
    theme_color: 'emerald',
    is_active: true,
    user_type: 'all',
    image_url: null
  };

  console.log("Trying insert with explicit columns in object...");
  const { data, error } = await supabase.from('app_banners').insert([bannerData]).select();
  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log("Insert succeeded:", data);
  }
}

testInsert();
