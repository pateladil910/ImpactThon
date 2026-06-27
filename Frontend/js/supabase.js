import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// TODO: Replace these with your actual Supabase Project URL and Anon Key
const supabaseUrl = 'https://krpbytwpmrsprnjkvrty.supabase.co'
const supabaseAnonKey = 'sb_publishable_K-KNUdWCBtX2AiUYS7s7YA_XTjKx34f'

// Initialize Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Global helper to check session
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  return data.session
}

// Global helper to sign out of Supabase
export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut()
  if (error) console.error("Supabase signout error:", error)
}
