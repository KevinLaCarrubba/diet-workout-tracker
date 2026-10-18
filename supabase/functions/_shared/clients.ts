import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Privileged client. Never return its results to callers without filtering. */
export const serviceClient = (): SupabaseClient =>
  createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Client that acts as the calling user (RLS applies). */
export async function userFromRequest(req: Request): Promise<{ user: User; client: SupabaseClient }> {
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not signed in');
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Not signed in');
  return { user: data.user, client };
}
