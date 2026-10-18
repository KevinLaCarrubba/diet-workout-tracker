import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: schemaResolver(schema, { sync: true }),
  });

  const submit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(
        error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message,
      );
      return;
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/sign-in' ? from : '/', { replace: true });
  });

  return (
    <AuthLayout title="Sign in" subtitle="FitTrack is invite-only. Use the account from your invitation.">
      <form onSubmit={submit} noValidate>
        <Stack>
          {error && (
            <Alert color="red" variant="light" role="alert">
              {error}
            </Alert>
          )}
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            {...form.getInputProps('password')}
          />
          <Button type="submit" loading={form.submitting} fullWidth size="lg">
            Sign in
          </Button>
          <Text size="sm" ta="center">
            <Anchor component={Link} to="/forgot-password">
              Forgot password?
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthLayout>
  );
}
