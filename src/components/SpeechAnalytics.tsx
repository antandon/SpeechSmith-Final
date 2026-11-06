
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Award, Target, Activity } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { scoreBar, scoreBadge } from '@/lib/utils';

const SpeechAnalytics: React.FC = () => {
  const { speechData, hasRecorded } = useSpeech();

  if (!hasRecorded || !speechData) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold text-slate-900">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Activity className="h-5 w-5" /></span>
            <span>Speech Analytics Dashboard</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-16">
          <div className="text-gray-500">
            <Activity className="h-20 w-20 mx-auto mb-6 opacity-30" />
            <p className="text-xl font-semibold">No Analytics Data Available</p>
            <p className="text-lg mt-3 text-gray-400">Complete a speech analysis to see your progress</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Use analytics data from edge function or generate from feedback
  const generateAnalytics = () => {
    // Malformed items (no string category / non-numeric score) are dropped rather than crashing.
    const feedback = (speechData.feedback || []).filter(f => typeof f?.category === 'string' && typeof f.score === 'number');
    // Prefer the model's own holistic judgment; fall back to a plain average only
    // for historical sessions saved before overallScore existed.
    const overallScore = typeof speechData.overallScore === 'number'
      ? speechData.overallScore
      : feedback.length > 0
        ? Math.round(feedback.reduce((sum, f) => sum + f.score, 0) / feedback.length)
        : 0;

    // Use analytics data from edge function if available
    const categoryScores = speechData.analytics?.categoryScores || feedback.map(f => ({
      name: f.category,
      value: f.score
    }));

    // Map feedback categories to display scores - match the analysis' category names
    const pronunciationScore = feedback.find(f => f.category.toLowerCase().includes('pronunciation'))?.score || 0;
    const paceScore = feedback.find(f => f.category.toLowerCase().includes('pace'))?.score || 0;
    // Reading exercises (and some old reports) have no Structure score - the card is hidden then.
    const structureScore = categoryScores.find(c => c?.name === 'Structure')?.value;

    return {
      overallScore,
      categoryScores,
      clarity: pronunciationScore, // "Pronunciation" maps to clarity
      pace: paceScore, // "Speaking Pace" maps to pace
      structure: typeof structureScore === 'number' ? structureScore : null,
      feedback,
    };
  };

  const analytics = generateAnalytics();

  // Colour carries meaning (how good the score is), not decoration.

  const ScoreCard = ({ title, score, icon: Icon }: { title: string; score: number; icon: any }) => (
    <div className="rounded-xl border bg-accent/30 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="rounded-md bg-secondary/10 p-1.5 text-secondary"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{score}%</p>
      <div className="mt-3 h-1.5 rounded-full bg-white">
        <div className={`h-1.5 rounded-full transition-all duration-500 motion-safe:animate-bar-grow ${scoreBar(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-3 text-lg font-semibold text-slate-900">
          <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Activity className="h-5 w-5" /></span>
          <span>Speech Analytics Dashboard</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {/* Score Cards */}
        <div className={`grid grid-cols-2 gap-4 mb-6 ${analytics.structure === null ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          <ScoreCard
            title="Overall Score"
            score={analytics.overallScore}
            icon={Award}
          />
          <ScoreCard
            title="Clarity"
            score={analytics.clarity}
            icon={Target}
          />
          <ScoreCard
            title="Pace"
            score={analytics.pace}
            icon={TrendingUp}
          />
          {analytics.structure !== null && (
            <ScoreCard
              title="Structure"
              score={analytics.structure}
              icon={Activity}
            />
          )}
        </div>

        {speechData.overallScoreRationale && (
          <p className="text-sm text-slate-600 -mt-2 mb-6">{speechData.overallScoreRationale}</p>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-1 gap-8">

          {/* Improvement Suggestions */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <TrendingUp className="h-4 w-4 text-secondary" />
              Improvement Areas
            </h4>
              <div className="space-y-3">
                {/* Anything short of 100 still has room to improve - weakest first. */}
                {analytics.feedback.some(f => f.score < 100) ? analytics.feedback.filter(f => f.score < 100).sort((a, b) => a.score - b.score).map((item, index) => (
                  <div key={index} className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-900">{item.category}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${scoreBadge(item.score, item.color)}`}>{item.score}</span>
                    </div>
                    <p className="text-sm text-slate-600">{item.feedback}</p>
                  </div>
                )) : analytics.feedback.length > 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Award className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Perfect - every area scored 100</p>
                  </div>
                ) : (
                  <p className="text-center py-8 text-gray-500">No area-by-area feedback was saved for this recording.</p>
                )}
              </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
};

export default SpeechAnalytics;
