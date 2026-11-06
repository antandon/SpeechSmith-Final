import React from 'react';
import { Button } from '@/components/ui/button';
import { MicOff } from 'lucide-react';
import type { SpeechData } from '@/context/SpeechContext';

// The edge function's insufficient-audio result (too few clear words): every
// section would just show 0, so explain it once instead.
export const isNoSpeech = (data?: SpeechData | null) => data?.speechMetrics?.wordsPerMinute === 0;

const NoSpeechNotice: React.FC<{ speechData: SpeechData; onRetry?: () => void }> = ({ speechData, onRetry }) => {
  const heard = speechData.transcription?.trim();
  return (
    <div className="mx-auto mt-6 max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <MicOff className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">
        {heard ? 'Your answer was too short to score' : "We couldn't hear enough speech"}
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        {heard
          ? 'We need at least a couple of full sentences to judge pace, clarity and content, so there are no scores for this one.'
          : 'This recording had too little clear speech to analyse, so there are no scores for it.'}
      </p>

      {heard ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <span className="font-medium">What we heard:</span> "{heard}"
        </p>
      ) : null}

      {speechData.audioUrl && (
        <audio controls className="mt-4 w-full" src={speechData.audioUrl} />
      )}

      <ul className="mt-6 space-y-2 text-left text-sm text-slate-600">
        <li>• Check your microphone is allowed in the browser and not muted.</li>
        <li>• Speak clearly for at least 20-30 seconds.</li>
        <li>• If uploading, make sure the file has someone speaking in it.</li>
      </ul>

      {onRetry && (
        <Button className="mt-6 w-full" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
};

export default NoSpeechNotice;
