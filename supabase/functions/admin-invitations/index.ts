// Admin-only member management: create/revoke invitations, issue one-time
// sign-in links, remove members. Runs with the service role; every request is
// authorised by checking the caller's own JWT and admin role first.
import { serviceClient, userFromRequest } from '../_shared/clients.ts';
import { handle, HttpError, json } from '../_shared/http.ts';

type Body =
  | { action: 'invite'; email: string; send_email?: boolean; origin: string }
  | { action: 'new_link'; invitation_id: string; origin: string }
  | { action: 'revoke'; invitation_id: string; origin: string }
  | { action: 'reset_link'; user_id: string; origin: string }
  | { action: 'remove_member'; user_id: string; origin: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function appOrigin(raw: string): string {
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    throw new HttpError(400, 'Invalid origin');
  }
  const allowed = (Deno.env.get('ALLOWED_APP_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(origin)) throw new HttpError(400, 'Origin not allowed');
  if (!origin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new HttpError(400, 'Origin must be https');
  }
  return origin;
}

const confirmLink = (origin: string, tokenHash: string, type: string) =>
  `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;

const uuid = (v: unknown) => {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, 'Invalid id');
  return v;
};

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const { user, client } = await userFromRequest(req);
    const { data: isAdmin, error: adminError } = await client.rpc('is_admin');
    if (adminError || !isAdmin) throw new HttpError(403, 'Admin only');

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
    const origin = appOrigin(body.origin);
    const admin = serviceClient();

    switch (body.action) {
      case 'invite': {
        const email = String(body.email ?? '')
          .trim()
          .toLowerCase();
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Invalid email');

        const [{ data: exists }, { data: seats }, { data: max }] = await Promise.all([
          admin.rpc('auth_email_exists', { p_email: email }),
          admin.rpc('seats_in_use'),
          admin.rpc('max_members'),
        ]);
        if (exists) throw new HttpError(409, 'That email already has an account');
        if ((seats as number) >= (max as number)) throw new HttpError(409, 'All member seats are in use');

        // Expire stale pending rows so the one-pending-per-email index allows a fresh invite.
        await admin
          .from('invitations')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('email', email)
          .eq('status', 'pending')
          .lt('expires_at', new Date().toISOString());

        const { data: invitation, error: insertError } = await admin
          .from('invitations')
          .insert({ email, invited_by: user.id })
          .select('id')
          .single();
        if (insertError) {
          if (insertError.code === '23505')
            throw new HttpError(409, 'That email already has a pending invitation');
          throw insertError;
        }

        if (body.send_email) {
          const { error } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${origin}/auth/confirm`,
          });
          if (error) {
            await admin.from('invitations').delete().eq('id', invitation.id);
            throw new HttpError(502, `Could not send email: ${error.message}`);
          }
          return json({ email_sent: true });
        }

        const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email });
        if (error) {
          await admin.from('invitations').delete().eq('id', invitation.id);
          throw new HttpError(502, error.message);
        }
        return json({ link: confirmLink(origin, data.properties.hashed_token, 'invite') });
      }

      case 'new_link': {
        const { data: inv } = await admin
          .from('invitations')
          .select('id, email, status, invited_user_id')
          .eq('id', uuid(body.invitation_id))
          .maybeSingle();
        if (!inv || inv.status !== 'pending') throw new HttpError(404, 'Invitation not found');
        await admin
          .from('invitations')
          .update({ expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })
          .eq('id', inv.id);
        const type = inv.invited_user_id ? 'magiclink' : 'invite';
        const { data, error } = await admin.auth.admin.generateLink({ type, email: inv.email });
        if (error) throw new HttpError(502, error.message);
        return json({ link: confirmLink(origin, data.properties.hashed_token, type) });
      }

      case 'revoke': {
        const { data: inv } = await admin
          .from('invitations')
          .select('id, status, invited_user_id')
          .eq('id', uuid(body.invitation_id))
          .maybeSingle();
        if (!inv || inv.status !== 'pending') throw new HttpError(404, 'Invitation not found');
        await admin
          .from('invitations')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('id', inv.id);
        if (inv.invited_user_id) {
          const { data } = await admin.auth.admin.getUserById(inv.invited_user_id);
          // Only remove the placeholder account if it was never activated.
          if (data.user && !data.user.email_confirmed_at)
            await admin.auth.admin.deleteUser(inv.invited_user_id);
        }
        return json({ ok: true });
      }

      case 'reset_link': {
        const { data: target } = await admin.auth.admin.getUserById(uuid(body.user_id));
        if (!target.user?.email) throw new HttpError(404, 'Member not found');
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: target.user.email,
        });
        if (error) throw new HttpError(502, error.message);
        return json({ link: confirmLink(origin, data.properties.hashed_token, 'recovery') });
      }

      case 'remove_member': {
        const targetId = uuid(body.user_id);
        if (targetId === user.id) throw new HttpError(400, 'You cannot remove yourself');
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', targetId)
          .maybeSingle();
        if (!profile) throw new HttpError(404, 'Member not found');
        if (profile.role === 'admin') throw new HttpError(400, 'Admins cannot be removed here');
        // Private files are not covered by the database cascade.
        const { data: files } = await admin.storage.from('progress-photos').list(targetId, { limit: 1000 });
        if (files && files.length > 0) {
          await admin.storage.from('progress-photos').remove(files.map((f) => `${targetId}/${f.name}`));
        }
        const { error } = await admin.auth.admin.deleteUser(targetId);
        if (error) throw new HttpError(502, error.message);
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action');
    }
  }),
);
