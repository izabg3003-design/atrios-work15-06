console.log("Checking env keys...");
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "EXISTS" : "MISSING");
console.log("VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL ? "EXISTS" : "MISSING");
console.log("VITE_SUPABASE_ANON_KEY:", process.env.VITE_SUPABASE_ANON_KEY ? "EXISTS" : "MISSING");
