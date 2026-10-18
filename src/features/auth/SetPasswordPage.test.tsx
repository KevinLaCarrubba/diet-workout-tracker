import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SetPasswordPage } from './SetPasswordPage';

const updateUser = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) } },
}));
vi.mock('./useAuth', () => ({ useAuth: () => ({ clearRecovery: () => {} }) }));

describe('SetPasswordPage', () => {
  it('enforces the password policy before calling Supabase', async () => {
    renderWithProviders(<SetPasswordPage />);
    await userEvent.type(screen.getByLabelText('New password'), 'onlyletters');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'onlyletters');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Include at least one number')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
