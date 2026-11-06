import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone, Lightbulb } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';

// Suggests phrases that would land better with vocal emphasis, based on the
// transcription's content. This cannot be - and does not claim to be - a
// measurement of whether the speaker actually emphasized anything in the
// recording, since that needs real audio/prosody analysis (pitch, vocal
// stress) that a text transcript doesn't carry.
const EmphasisSuggestions: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  if (!hasRecorded || !speechData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Megaphone className="h-5 w-5" /></span>
            <span>Suggested Emphasis</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to get emphasis suggestions</p>
        </CardContent>
      </Card>
    );
  }

  const isInsufficientAudio = speechData.speechMetrics?.wordsPerMinute === 0;
  const phrases = speechData.emphasisSuggestions?.phrases || [];
  const tips = speechData.emphasisSuggestions?.tips || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Megaphone className="h-5 w-5" /></span>
          <span>Suggested Emphasis</span>
        </CardTitle>
        <p className="text-xs text-gray-500">
          Phrases worth stressing for impact — based on your words, not a measurement of your actual delivery.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInsufficientAudio ? (
          <p className="text-center py-6 text-gray-500">Not enough speech was captured in this recording to suggest emphasis.</p>
        ) : phrases.length === 0 ? (
          <p className="text-center py-6 text-gray-500">Not enough content in this speech to suggest emphasis.</p>
        ) : (
          <div className="space-y-3">
            {phrases.map((item, index) => (
              <div key={index} className="border rounded-lg p-3 bg-white">
                <p className="text-sm font-semibold text-slate-900">"{item.phrase}"</p>
                {item.how && <p className="text-xs text-primary font-medium mt-1">{item.how}</p>}
                <p className="text-xs text-gray-600 mt-1">{item.reason}</p>
              </div>
            ))}
          </div>
        )}

        {tips.length > 0 && (
          <div className="rounded-lg border bg-slate-50 p-4">
            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              Tips
            </h4>
            <div className="text-sm text-slate-700 space-y-1">
              {tips.map((tip, index) => (
                <p key={index}>• {tip}</p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EmphasisSuggestions;
