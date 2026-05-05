import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabasePublishableKey) {
  throw new Error('Missing Supabase publishable key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}

if (!supabaseSecretKey) {
  throw new Error('Missing Supabase secret key. Set SUPABASE_SECRET_KEY.');
}

// Client for browser usage
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Admin client for server-side (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);
