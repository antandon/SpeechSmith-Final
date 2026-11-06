
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, Users, Volume2, Lightbulb } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { scoreText } from '@/lib/utils';

const MoodToneAnalysis: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  // The backend's real toneAnalysis (saved under both pitchAnalysis and
  // emotionAnalysis for historical reasons - they're always the same object)
  // is the actual AI-detected tone, not a guess derived from unrelated
  // category scores. History rows saved before this field existed have none -
  // they show a not-assessed state rather than invented defaults.
  const tone = speechData?.emotionAnalysis ?? speechData?.pitchAnalysis;

  const isInsufficientAudio = speechData?.speechMetrics?.wordsPerMinute === 0;
  // Pitch, rhythm and pauses only from Azure's audio measurements - a transcript can't show them.
  const measured = isInsufficientAudio ? undefined : tone?.measured;

  const getBadgeColor = (level: string) => {
    switch (level) {
      case 'formal': return 'bg-accent text-stone-900';
      case 'professional': return 'bg-green-100 text-green-800';
      case 'casual':
      case 'informal': return 'bg-yellow-100 text-yellow-800';
      case 'confident':
      case 'energetic':
      case 'varied':
      case 'consistent': return 'bg-green-100 text-green-800';
      case 'hesitant':
      case 'monotone':
      case 'variable': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const deliveryFeedback = (speechData?.feedback || []).filter(f =>
    /emotional|delivery/i.test(typeof f?.category === 'string' ? f.category : '') && f.feedback);

  if (!hasRecorded || !speechData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Heart className="h-5 w-5" /></span>
            <span>Mood & Tone Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10 text-gray-500">
          <p>Record a speech to analyze emotional delivery and tone</p>
          <p className="text-sm mt-2">Get insights on confidence, energy, and audience suitability</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Heart className="h-5 w-5" /></span>
          <span>Mood & Tone Analysis</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isInsufficientAudio || !tone ? (
          <p className="text-center py-6 text-gray-500">
            {isInsufficientAudio
              ? 'Not enough speech was captured in this recording to assess mood or tone.'
              : "Mood and tone weren't assessed for this recording."}
          </p>
        ) : (<>
        {/* Primary Emotion */}
        <div className="rounded-lg border bg-slate-50 p-4">
          <h3 className="text-lg font-semibold capitalize text-slate-900">{tone.primaryEmotion}</h3>
          <p className="text-sm text-slate-500">Primary detected emotion</p>
        </div>

        {/* Delivery */}
        <div>
          <div className="flex items-center gap-1 text-sm font-medium mb-2">
            <Volume2 className="h-4 w-4" />
            Delivery Style
          </div>
          <Badge className={getBadgeColor(tone.deliveryStyle)}>
            {tone.deliveryStyle}
          </Badge>
        </div>

        {measured && (measured.fluency !== null || measured.prosody !== null || measured.monotone !== null) && (
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="font-semibold">Measured from your audio</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              {measured.fluency !== null && (
                <div className="rounded-md bg-gray-50 p-3">
                  <div className={`text-2xl font-bold ${scoreText(measured.fluency)}`}>{measured.fluency}</div>
                  <div className="text-xs text-gray-600">Fluency</div>
                </div>
              )}
              {measured.prosody !== null && (
                <div className="rounded-md bg-gray-50 p-3">
                  <div className={`text-2xl font-bold ${scoreText(measured.prosody)}`}>{measured.prosody}</div>
                  <div className="text-xs text-gray-600">Rhythm & intonation</div>
                </div>
              )}
              {/* null = pitch wasn't measured, so no verdict */}
              {measured.monotone !== null && (
                <div className="rounded-md bg-gray-50 p-3">
                  <div className={`text-lg font-bold ${measured.monotone ? 'text-orange-600' : 'text-green-600'}`}>
                    {measured.monotone ? 'Flat' : 'Natural'}
                  </div>
                  <div className="text-xs text-gray-600">Pitch</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tone Characteristics */}
        <div>
          <h4 className="font-semibold mb-3">Tone Characteristics</h4>
          <div className="flex flex-wrap gap-2">
            <Badge className={getBadgeColor(tone.formalityLevel)}>
              {tone.formalityLevel} tone
            </Badge>
            <Badge className={getBadgeColor(tone.audienceSuitability)}>
              {tone.audienceSuitability} audience
            </Badge>
          </div>
        </div>

        {/* Detailed Analysis */}
        <div className="bg-gray-50 p-4 rounded-md">
          <h4 className="font-semibold mb-2 flex items-center gap-1">
            <Users className="h-4 w-4" />
            Audience Impact Analysis
          </h4>
          <div className="text-sm space-y-2">
            <p>
              <strong>Delivery:</strong> {tone.deliveryStyle === 'confident'
                ? 'Strong, confident delivery with clear emotional connection'
                : tone.deliveryStyle === 'energetic'
                ? 'High-energy delivery that keeps the audience engaged'
                : tone.deliveryStyle === 'monotone'
                ? 'Flat delivery - your pitch barely changed, which makes it harder for listeners to stay engaged'
                : 'Hesitant delivery - consider practicing with more conviction and vocal variety'
              }
            </p>
            <p>
              <strong>Audience Suitability:</strong> {tone.audienceSuitability === 'professional'
                ? 'Well-suited for professional presentations and formal settings'
                : tone.audienceSuitability === 'informal'
                ? 'Better suited for casual conversations and informal settings'
                : 'Suitable for a general audience'
              }
            </p>
            {/* Flat pitch is covered by the delivery line, the Pitch tile and the feedback - not repeated here */}
            {measured?.monotone === false && (
              <p><strong>Pitch:</strong> Your pitch rose and fell naturally.</p>
            )}
          </div>
        </div>
        </>)}

        {/* Recommendations - the hesitant/flat-pitch advice is already in Audience Impact above */}
        {deliveryFeedback.length > 0 && !isInsufficientAudio && (
          <div className="bg-accent/50 p-4 rounded-md">
            <h4 className="font-semibold text-stone-900 mb-2">Recommendations</h4>
            <div className="text-sm text-stone-700 space-y-1">
              {deliveryFeedback.map((feedback, index) => (
                <p key={index}>• {feedback.feedback}</p>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Tone Adjustments */}
        {!isInsufficientAudio && speechData.toneSuggestions && speechData.toneSuggestions.phrases.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Suggested Tone Adjustments</h4>
            <div className="space-y-3">
              {speechData.toneSuggestions.phrases.map((item, index) => (
                <div key={index} className="border rounded-lg p-3 bg-accent/50">
                  <p className="text-sm text-gray-500 italic">"{item.original}"</p>
                  <p className="text-sm font-medium text-stone-900 mt-1">→ "{item.rewritten}"</p>
                  <p className="text-xs text-gray-600 mt-2">
                    <Badge className="bg-accent text-stone-900 mr-1">{item.suggestedTone}</Badge>
                    {item.reason}
                  </p>
                </div>
              ))}
            </div>
            {speechData.toneSuggestions.tips.length > 0 && (
              <div className="bg-accent/50 p-4 rounded-md mt-3">
                <h4 className="font-semibold text-stone-900 mb-2 flex items-center gap-1">
                  <Lightbulb className="h-4 w-4" />
                  Tips
                </h4>
                <div className="text-sm text-stone-700 space-y-1">
                  {speechData.toneSuggestions.tips.map((tip, index) => (
                    <p key={index}>• {tip}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MoodToneAnalysis;
