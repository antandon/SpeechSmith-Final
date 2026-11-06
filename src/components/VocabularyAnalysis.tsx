import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Lightbulb } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';

const VocabularyAnalysis: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  if (!hasRecorded || !speechData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><BookOpen className="h-5 w-5" /></span>
            <span>Vocabulary</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to get vocabulary feedback</p>
        </CardContent>
      </Card>
    );
  }

  // The settings this report was analysed with - not the live config (absent on old reports).
  const isReadingExercise = speechData.speechConfig?.purposeKey === 'reading-exercise';
  const unavailable = speechData.vocabularyAnalysis?.unavailable === true;
  const isInsufficientAudio = speechData.speechMetrics?.wordsPerMinute === 0;
  const strengths = speechData.vocabularyAnalysis?.strengths || [];
  const weaknesses = (speechData.vocabularyAnalysis?.weaknesses || []);
  const tips = speechData.vocabularyAnalysis?.tips || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><BookOpen className="h-5 w-5" /></span>
          <span>Vocabulary</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReadingExercise ? (
          <p className="text-center py-6 text-gray-500">Vocabulary isn't assessed for a reading exercise — the words are the original text's, not your own choice.</p>
        ) : isInsufficientAudio ? (
          <p className="text-center py-6 text-gray-500">Not enough speech was captured in this recording to assess vocabulary.</p>
        ) : unavailable ? (
          <p className="text-center py-6 text-gray-500">This check couldn't be completed for this recording - try recording again.</p>
        ) : strengths.length === 0 && weaknesses.length === 0 ? (
          <p className="text-center py-6 text-gray-500">Not enough content in this speech to assess vocabulary.</p>
        ) : (
          <>
            {strengths.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-green-800 mb-2">Strong word choices</h4>
                <div className="space-y-2">
                  {strengths.map((item, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Badge className="bg-green-100 text-green-800 shrink-0">{item.word}</Badge>
                      <p className="text-sm text-gray-600">{item.context}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {weaknesses.length === 0 && (
              <p className="text-sm text-gray-600">Nothing to upgrade - your word choice fits this speech.</p>
            )}

            {weaknesses.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-amber-800 mb-2">Upgrade your word choice</h4>
                <div className="space-y-3">
                  {weaknesses.map((item, index) => (
                    <div key={index} className="border rounded-lg p-3 bg-amber-50/40 border-amber-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">You said</span>
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{item.word}</Badge>
                      </div>
                      {item.alternatives && item.alternatives.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <span className="text-xs text-gray-500">Try instead</span>
                          {item.alternatives.map((alt, altIndex) => (
                            <Badge key={altIndex} variant="outline" className="border-green-300 text-green-800 bg-white">{alt}</Badge>
                          ))}
                        </div>
                      )}
                      {item.betterPhrase && (
                        <p className="text-sm text-green-800 mt-2">
                          <span className="font-semibold">Stronger phrasing: </span>"{item.betterPhrase}"
                        </p>
                      )}
                      {item.idiom && (
                        <p className="text-sm text-stone-900 mt-1">
                          <span className="font-semibold">Idiom: </span>"{item.idiom}"
                        </p>
                      )}
                      {item.suggestion && <p className="text-xs text-gray-600 mt-1">{item.suggestion}</p>}
                    </div>
                  ))}
                </div>
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

export default VocabularyAnalysis;
