import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from './env';

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Unwraps a PostgREST/Functions result, throwing on error so TanStack Query sees it. */
export function unwrap<R extends { data: unknown; error: { message: string; code?: string } | null }>(
  result: R,
): Extract<R, { error: null }>['data'] {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as Extract<R, { error: null }>['data'];
}
