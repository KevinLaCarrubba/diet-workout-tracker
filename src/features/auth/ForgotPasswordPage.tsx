import { Alert, Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useState } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.email('Enter a valid email') });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ initialValues: { email: '' }, validate: schemaResolver(schema, { sync: true }) });

  const submit = form.onSubmit(async ({ email }) => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    if (error) setError(error.message);
    else setSent(true);
  });

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <Alert color="lime" variant="light">
          If an account exists for that address, a reset link is on its way. If it doesn't arrive, ask your
          FitTrack admin for a reset link.
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Stack>
            {error && (
              <Alert color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}
            <TextInput label="Email" type="email" autoComplete="email" {...form.getInputProps('email')} />
            <Button type="submit" loading={form.submitting} fullWidth size="lg">
              Send reset link
            </Button>
          </Stack>
        </form>
      )}
      <Text size="sm" ta="center">
        <Anchor component={Link} to="/sign-in">
          Back to sign in
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
