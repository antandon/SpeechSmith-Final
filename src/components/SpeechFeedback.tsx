
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Check, AudioLines, AlertCircle } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { scoreText } from '@/lib/utils';

interface FeedbackItem {
  category: string;
  score: number;
  feedback: string;
  color: string;
}

interface SpeechFeedbackProps {
  feedbackData?: FeedbackItem[];
}

const defaultFeedback: FeedbackItem[] = [
  {
    category: 'Clarity',
    score: 85,
    feedback: 'Your speech was generally clear. Consider slowing down slightly on technical terms.',
    color: 'bg-green-500'
  },
  {
    category: 'Pace',
    score: 62,
    feedback: 'Your speaking pace varied. Try to maintain a more consistent rhythm.',
    color: 'bg-yellow-500'
  },
  {
    category: 'Filler Words',
    score: 70,
    feedback: 'Used "um" and "like" occasionally. Practice reducing these for more confident delivery.',
    color: 'bg-blue-500'
  },
  {
    category: 'Structure',
    score: 90,
    feedback: 'Excellent organization of ideas with clear introduction and conclusion.',
    color: 'bg-purple-500'
  },
];

const SpeechFeedback: React.FC<SpeechFeedbackProps> = ({ feedbackData }) => {
  const { speechData, hasRecorded } = useSpeech();
  
  // Only use real feedback data - no default mock data. Malformed items are dropped, not rendered as NaN.
  const actualFeedbackData = (speechData?.feedback || feedbackData)
    ?.filter(f => typeof f?.category === 'string' && typeof f.score === 'number');
  const mispronuncedWords = speechData?.mispronuncedWords || [];
  
  if (!actualFeedbackData || actualFeedbackData.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><AudioLines className="h-5 w-5" /></span>
              <span>Speech Feedback</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10">
          <div className="text-gray-500">
            {!hasRecorded ? (
              <div>
                <p className="mb-2">Record a speech to get personalized feedback</p>
                <p className="text-sm">Your speech will be analyzed using AI for detailed insights</p>
              </div>
            ) : speechData ? (
              // A finished report with no usable feedback items - not still processing.
              <p>No area-by-area feedback was saved for this recording.</p>
            ) : (
              <div>
                <p className="mb-2">Processing your speech...</p>
                <p className="text-sm">Analysis in progress</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Same overall score as the dashboard; the plain average is only a fallback
  // for historical sessions saved before overallScore existed.
  const overallScore = typeof speechData?.overallScore === 'number'
    ? speechData.overallScore
    : Math.round(actualFeedbackData.reduce((sum, item) => sum + item.score, 0) / actualFeedbackData.length);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><AudioLines className="h-5 w-5" /></span>
            <span>Speech Feedback</span>
          </div>
          <div className={`text-2xl font-bold ${scoreText(overallScore)}`}>
            {overallScore}/100
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {actualFeedbackData.map((item, index) => (
            <div key={index}>
              <div className="flex justify-between mb-1">
                <span className="font-medium">{item.category}</span>
                <span className={`font-semibold ${scoreText(item.score, item.color)}`}>{item.score}/100</span>
              </div>
              <Progress
                value={item.score}
                max={100}
                className={`h-2 mb-2 ${item.color}`}
              />
              <p className="text-sm text-gray-600">{item.feedback}</p>
            </div>
          ))}
          
          <div className="border-t pt-4 mt-6">
            <h4 className="font-semibold mb-2 flex items-center gap-1">
              <Check className="h-4 w-4 text-green-500" />
              <span>AI Analysis Complete</span>
            </h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-1">
                <span className="text-gray-700">•</span>
                <span>
                  {speechData?.speechMetrics?.wordsPerMinute === 0
                    ? 'Not enough speech was captured in this recording to assess'
                    : 'Analysis based on your actual recorded speech'}
                </span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-gray-700">•</span>
                <span>Feedback generated using advanced AI speech analysis</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-gray-700">•</span>
                <span>Practice regularly to see improvement over time</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SpeechFeedback;
