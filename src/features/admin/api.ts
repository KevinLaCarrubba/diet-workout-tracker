import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, unwrap } from '@/lib/supabase';

export function useMembers() {
  return useQuery({
    queryKey: ['admin', 'members'],
    queryFn: async () => unwrap(await supabase.rpc('admin_list_members')),
  });
}

export function useInvitations() {
  return useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: async () =>
      unwrap(await supabase.from('invitations').select('*').order('created_at', { ascending: false })),
  });
}

export type AdminAction =
  | { action: 'invite'; email: string; send_email: boolean }
  | { action: 'new_link'; invitation_id: string }
  | { action: 'revoke'; invitation_id: string }
  | { action: 'reset_link'; user_id: string }
  | { action: 'remove_member'; user_id: string };

export interface AdminResult {
  link?: string;
  email_sent?: boolean;
}

async function callAdmin(body: AdminAction): Promise<AdminResult> {
  const { data, error } = await supabase.functions.invoke<AdminResult>('admin-invitations', {
    body: { ...body, origin: window.location.origin },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Request failed');
    }
    throw error;
  }
  return data ?? {};
}

export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: callAdmin,
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
