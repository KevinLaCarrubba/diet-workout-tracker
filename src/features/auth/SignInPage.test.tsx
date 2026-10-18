import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SignInPage } from './SignInPage';

const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) } },
}));

describe('SignInPage', () => {
  it('validates input before calling Supabase', async () => {
    renderWithProviders(<SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows a friendly error for bad credentials', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    renderWithProviders(<SignInPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'wrong-password',
    });
  });
});
