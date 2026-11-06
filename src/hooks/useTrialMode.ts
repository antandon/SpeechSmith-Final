
import { useState, useEffect } from 'react';

interface TrialData {
  usageCount: number;
  firstUsed: string;
}

const TRIAL_LIMIT = 5;
const TRIAL_STORAGE_KEY = 'speechsmith_trial_data';
// Every useTrialMode() call has its own state; this event keeps them all in step
// (e.g. the banner updates when a recording elsewhere uses up a try).
const TRIAL_CHANGE_EVENT = 'speechsmith-trial-change';

const readTrialData = (): TrialData =>
  JSON.parse(localStorage.getItem(TRIAL_STORAGE_KEY) || '{"usageCount": 0, "firstUsed": ""}');

export const useTrialMode = () => {
  const [trialData, setTrialData] = useState<TrialData>(readTrialData);

  useEffect(() => {
    const sync = () => setTrialData(readTrialData());
    window.addEventListener(TRIAL_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync); // other tabs
    return () => {
      window.removeEventListener(TRIAL_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const incrementUsage = () => {
    const currentData = readTrialData();
    localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify({
      usageCount: currentData.usageCount + 1,
      firstUsed: currentData.firstUsed || new Date().toISOString()
    }));
    window.dispatchEvent(new Event(TRIAL_CHANGE_EVENT));
  };

  const getRemainingTries = () => {
    return Math.max(0, TRIAL_LIMIT - trialData.usageCount);
  };

  const resetTrial = () => {
    localStorage.removeItem(TRIAL_STORAGE_KEY);
    window.dispatchEvent(new Event(TRIAL_CHANGE_EVENT));
  };

  return {
    trialData,
    isTrialExpired: trialData.usageCount >= TRIAL_LIMIT,
    incrementUsage,
    getRemainingTries,
    resetTrial,
    trialLimit: TRIAL_LIMIT
  };
};
