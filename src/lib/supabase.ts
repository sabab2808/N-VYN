import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const legacyAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const key = publishableKey ?? legacyAnonKey

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const supabaseConfigured = Boolean(supabase)
