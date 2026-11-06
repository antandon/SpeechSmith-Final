import { useEffect } from 'react';
import { storedSpeechConfig, useSpeech } from '@/context/SpeechContext';

// Practice modes set their own config (with a practicePrompt) when recording
// starts. Drop it when leaving the mode so a later free recording isn't judged
// against the old practice prompt - and bring back the user's saved setup.
export const useClearPracticeConfigOnLeave = () => {
  const { setSpeechConfig } = useSpeech();
  useEffect(
    () => () => setSpeechConfig(prev => (prev?.practicePrompt ? storedSpeechConfig() : prev)),
    [setSpeechConfig]
  );
};
