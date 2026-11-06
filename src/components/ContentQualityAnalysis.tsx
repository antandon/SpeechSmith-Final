import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Lightbulb, Target } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  'off-topic': 'Off topic',
  'repetition': 'Repetition',
  'vague': 'Vague',
  'missing-detail': 'Missing detail',
  'structure': 'Structure',
  'weak-opening': 'Opening',
  'weak-closing': 'Closing',
};

const ALIGNMENT_STYLES = {
  'aligned': { label: 'On topic', className: 'bg-green-50 border-green-200 text-green-900', badge: 'bg-green-100 text-green-800 hover:bg-green-100' },
  'partial': { label: 'Partially on topic', className: 'bg-amber-50 border-amber-200 text-amber-900', badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  'off-topic': { label: 'Off topic', className: 'bg-red-50 border-red-200 text-red-900', badge: 'bg-red-100 text-red-800 hover:bg-red-100' },
} as const;

const ContentQualityAnalysis: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  if (!hasRecorded || !speechData) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><FileText className="h-5 w-5" /></span>
            <span>Content Quality</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to get content feedback</p>
        </CardContent>
      </Card>
    );
  }

  // The settings this report was analysed with - not the live config (absent on old reports).
  const reportConfig = speechData.speechConfig;
  const isReadingExercise = reportConfig?.purposeKey === 'reading-exercise';
  const unavailable = speechData.contentQualityAnalysis?.unavailable === true;
  const isInsufficientAudio = speechData.speechMetrics?.wordsPerMinute === 0;
  const alignment = speechData.contentQualityAnalysis?.contextAlignment;
  const issues = speechData.contentQualityAnalysis?.issues || [];
  const tips = speechData.contentQualityAnalysis?.tips || [];
  const alignmentStyle = alignment ? ALIGNMENT_STYLES[alignment.status] : null;

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><FileText className="h-5 w-5" /></span>
          <span>Content Quality</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReadingExercise ? (
          <p className="text-center py-6 text-gray-500">Content quality isn't assessed for a reading exercise — you're reading someone else's words, not composing your own.</p>
        ) : isInsufficientAudio ? (
          <p className="text-center py-6 text-gray-500">Not enough speech was captured in this recording to assess content.</p>
        ) : unavailable ? (
          <p className="text-center py-6 text-gray-500">This check couldn't be completed for this recording - try recording again.</p>
        ) : (
          <>
            {alignment && alignmentStyle && (
              <div className={`border rounded-lg p-4 ${alignmentStyle.className}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4" />
                  <h4 className="font-semibold text-sm">
                    {reportConfig?.practicePrompt ? 'Did you answer the question?' : 'Does it match your topic?'}
                  </h4>
                  <Badge className={alignmentStyle.badge}>{alignmentStyle.label}</Badge>
                </div>
                <p className="text-sm">{alignment.summary}</p>
                {alignment.missingPoints.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1">What to cover</p>
                    <ul className="text-sm space-y-1">
                      {alignment.missingPoints.map((point, index) => (
                        <li key={index}>• {point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {issues.length === 0 ? (
              <p className="text-center py-6 text-gray-500">No content suggestions for this recording.</p>
            ) : (
              <div className="space-y-3">
                {issues.map((issue, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50 space-y-2">
                    <Badge variant="outline" className="text-xs">{ISSUE_TYPE_LABELS[issue.type] || issue.type}</Badge>
                    {issue.excerpt && <p className="text-sm text-gray-700 italic">"{issue.excerpt}"</p>}
                    {issue.problem && (
                      <p className="text-sm text-gray-700"><span className="font-semibold">Why it matters: </span>{issue.problem}</p>
                    )}
                    <p className="text-sm text-stone-900"><span className="font-semibold">What to do: </span>{issue.suggestion}</p>
                    {issue.example && (
                      <p className="text-sm text-green-800 bg-green-50 border border-green-100 rounded p-2">
                        <span className="font-semibold">Try: </span>"{issue.example}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tips.length > 0 && (
          <div className="bg-accent/50 p-4 rounded-md">
            <h4 className="font-semibold text-stone-900 mb-2 flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              Tips
            </h4>
            <div className="text-sm text-stone-700 space-y-1">
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

export default ContentQualityAnalysis;
