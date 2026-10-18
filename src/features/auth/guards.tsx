import { Navigate, Outlet, useLocation } from 'react-router';
import { FullScreenLoader } from '@/components/FullScreenLoader';
import { useProfile } from '@/features/profile/api';
import { useAuth } from './useAuth';

export function RequireAuth() {
  const { session, loading, recovering } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (recovering && location.pathname !== '/set-password') return <Navigate to="/set-password" replace />;
  return <Outlet />;
}

/** Sends members who have not finished onboarding to /onboarding. */
export function RequireOnboarded() {
  const profile = useProfile();
  // Offline with nothing cached: don't lock the user out of local features.
  if (profile.isPending && profile.fetchStatus !== 'idle') return <FullScreenLoader />;
  if (profile.data && !profile.data.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function RedirectIfSignedIn() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
