import { Alert, Button, PasswordInput, Stack } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function SetPasswordPage() {
  const navigate = useNavigate();
  const { clearRecovery } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { password: '', confirm: '' },
    validate: schemaResolver(schema, { sync: true }),
  });

  const submit = form.onSubmit(async ({ password }) => {
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    clearRecovery();
    navigate('/', { replace: true });
  });

  return (
    <AuthLayout
      title="Choose a password"
      subtitle="You'll use this with your email to sign in on any device."
    >
      <form onSubmit={submit} noValidate>
        <Stack>
          {error && (
            <Alert color="red" variant="light" role="alert">
              {error}
            </Alert>
          )}
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          <PasswordInput
            label="Confirm password"
            autoComplete="new-password"
            {...form.getInputProps('confirm')}
          />
          <Button type="submit" loading={form.submitting} fullWidth size="lg">
            Save password
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
