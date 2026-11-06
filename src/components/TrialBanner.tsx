
import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Crown } from 'lucide-react';

interface TrialBannerProps {
  remainingTries: number;
  isExpired: boolean;
}

const TrialBanner: React.FC<TrialBannerProps> = ({ remainingTries, isExpired }) => {
  const navigate = useNavigate();

  if (isExpired) {
    return (
      <Alert className="mb-6 border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-800">
            Your free trial has expired! Sign up to continue using SpeechSmith.
          </span>
          <Button 
            onClick={() => navigate('/auth')}
            className="ml-4 bg-red-600 hover:bg-red-700"
            size="sm"
          >
            <Crown className="mr-2 h-4 w-4" />
            Sign Up Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="rounded-none border-0 bg-neutral-950 py-2">
      <Crown className="h-4 w-4 !text-amber-400" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm text-white/80">
          Free trial: {remainingTries} {remainingTries === 1 ? 'try' : 'tries'} remaining
        </span>
        <Button 
          onClick={() => navigate('/auth')}
          variant="outline"
          size="sm"
          className="h-8 bg-white"
        >
          Sign Up for Unlimited Access
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default TrialBanner;
