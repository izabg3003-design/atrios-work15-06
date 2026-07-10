import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectColumns() {
  console.log("Inspecting columns of 'app_banners'...");
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'app_banners' });
  if (error) {
    console.error("RPC failed, trying query to information_schema...");
    // Let's run a raw query using a custom rpc or just fetch a single row and see keys
    const { data: row, error: rowError } = await supabase.from('app_banners').select('*').limit(1);
    if (rowError) {
      console.error("Row query failed:", rowError);
    } else {
      console.log("Columns present in first row:", row.length > 0 ? Object.keys(row[0]) : "No rows");
    }
  } else {
    console.log("Columns from RPC:", data);
  }
}

inspectColumns();
