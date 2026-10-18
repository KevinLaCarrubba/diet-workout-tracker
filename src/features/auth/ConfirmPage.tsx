import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';

const ALLOWED: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'email', 'signup'];

/**
 * Landing page for invite / recovery links: /auth/confirm?token_hash=…&type=invite
 * Exchanges the one-time token for a session, then asks for a password.
 */
export function ConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    if (!tokenHash || !type || !ALLOWED.includes(type)) {
      // Links from Supabase's default emails arrive with the session in the URL hash instead.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) navigate('/set-password', { replace: true });
        else setError('This link is incomplete. Ask your FitTrack admin for a new one.');
      });
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) {
        setError('This link has expired or was already used. Ask your FitTrack admin for a new one.');
        return;
      }
      navigate(type === 'recovery' || type === 'invite' ? '/set-password' : '/', { replace: true });
    });
  }, [params, navigate]);

  return (
    <AuthLayout title={error ? 'Link problem' : 'Signing you in…'}>
      {error ? (
        <Stack>
          <Alert color="red" variant="light" role="alert">
            {error}
          </Alert>
          <Text size="sm" ta="center">
            <Anchor component={Link} to="/sign-in">
              Go to sign in
            </Anchor>
          </Text>
        </Stack>
      ) : (
        <Loader mx="auto" />
      )}
    </AuthLayout>
  );
}
