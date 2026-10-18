import { useContext } from 'react';
import { AuthContext } from './authContext';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user's id. Only call inside routes guarded by <RequireAuth>. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId requires a signed-in user');
  return session.user.id;
}
