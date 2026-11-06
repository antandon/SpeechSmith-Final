
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTrialMode } from '@/hooks/useTrialMode';
import { Loader2 } from 'lucide-react';
import Login from './Login';
import TrialBanner from './TrialBanner';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children, requireAuth = false }) => {
  const { user, loading } = useAuth();
  const { isTrialExpired, getRemainingTries } = useTrialMode();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If authentication is required and user is not logged in
  if (requireAuth && !user) {
    return <Login />;
  }

  // If user is not logged in and trial has expired
  if (!user && isTrialExpired) {
    return <Login />;
  }

  // If user is not logged in but trial is still valid, show trial banner
  if (!user) {
    return (
      <>
        <TrialBanner remainingTries={getRemainingTries()} isExpired={false} />
        {children}
      </>
    );
  }

  // User is logged in, show content normally
  return <>{children}</>;
};

export default AuthGuard;
