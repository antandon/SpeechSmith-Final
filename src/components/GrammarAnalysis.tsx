import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SpellCheck, Lightbulb } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';

const GrammarAnalysis: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  if (!hasRecorded || !speechData) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><SpellCheck className="h-5 w-5" /></span>
            <span>Grammar</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to get grammar feedback</p>
        </CardContent>
      </Card>
    );
  }

  const isInsufficientAudio = speechData.speechMetrics?.wordsPerMinute === 0;
  // The check failed - an empty list then means "not checked", not "no issues".
  const unavailable = speechData.grammarAnalysis?.unavailable === true;
  const issues = (speechData.grammarAnalysis?.issues || []);
  const tips = speechData.grammarAnalysis?.tips || [];
  const refinementCount = issues.filter(i => i.kind === 'refinement').length;
  const errorCount = issues.length - refinementCount;

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><SpellCheck className="h-5 w-5" /></span>
          <span>Grammar</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInsufficientAudio ? (
          <p className="text-center py-6 text-gray-500">Not enough speech was captured in this recording to assess grammar.</p>
        ) : unavailable ? (
          <p className="text-center py-6 text-gray-500">This check couldn't be completed for this recording - try recording again.</p>
        ) : issues.length === 0 ? (
          <p className="text-center py-6 text-green-700">No grammar issues detected — nice work!</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {errorCount > 0
                ? `${errorCount} error${errorCount !== 1 ? 's' : ''} found`
                : 'No grammar errors found'}
              {refinementCount > 0 && ` · ${refinementCount} polish suggestion${refinementCount !== 1 ? 's' : ''}`}
            </p>
            {issues.map((issue, index) => {
              const isRefinement = issue.kind === 'refinement';
              return (
                <div key={index} className={`border rounded-lg p-3 ${isRefinement ? 'bg-accent/50 border-secondary/20' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={isRefinement ? 'bg-accent text-stone-900 hover:bg-accent' : 'bg-red-100 text-red-800 hover:bg-red-100'}>
                      {isRefinement ? 'Polish' : 'Error'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{issue.errorType}</Badge>
                  </div>
                  <p className={`text-sm ${isRefinement ? 'text-gray-600' : 'text-red-700 line-through decoration-red-400'}`}>{issue.original}</p>
                  <p className="text-sm text-green-700 font-medium mt-1">→ {issue.corrected}</p>
                  <p className="text-xs text-gray-600 mt-2">{issue.explanation}</p>
                </div>
              );
            })}
          </div>
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

export default GrammarAnalysis;
