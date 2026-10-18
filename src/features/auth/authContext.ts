import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';

export interface AuthState {
  session: Session | null;
  /** True until the persisted session has been read on startup. */
  loading: boolean;
  /** Set when the user arrived through a password-recovery link. */
  recovering: boolean;
  clearRecovery: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
