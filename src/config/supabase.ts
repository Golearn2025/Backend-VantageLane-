/**
 * Supabase Client Configuration
 * Backend server-side client with service role key
 *
 * ARCHITECTURE RULE:
 * - Frontend/browser clients → SUPABASE_ANON_KEY
 * - Backend/server-side services → SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
  );
}

// Create Supabase client with service role key
// Service role bypasses RLS for backend operations
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
});

// Export for testing/mocking
export default supabase;
