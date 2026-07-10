import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zuawenhgajcciefbwear.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXdlbmhnYWpjY2llZmJ3ZWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODA5OTksImV4cCI6MjA4Mjc1Njk5OX0.Rv7ST3AqC3vElYjore9-zLUcJmHUCPjrGCGkOE-5Ms8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectTriggers() {
  console.log("Listing triggers...");
  // Let's call rpc or direct select on a catalog if allowed, or query information_schema
  // Wait, does PostgREST expose pg_catalog or information_schema? Usually not, unless explicitly exposed.
  // But let's check!
  const { data: triggers, error: triggerError } = await supabase.from('triggers' as any).select('*');
  console.log("triggers direct:", triggers, "error:", triggerError);
}

inspectTriggers();
