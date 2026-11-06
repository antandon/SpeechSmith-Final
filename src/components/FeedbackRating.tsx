import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThumbsUp, ThumbsDown, MessageSquareText } from 'lucide-react';
import { useSpeech } from '@/context/SpeechContext';
import { useAuth } from '@/context/AuthContext';
import { saveFeedbackRating } from '@/utils/speechDataService';
import { toast } from 'sonner';

// Lets the user rate the AI coaching feedback (thumbs up/down + optional
// comment). This is logged for a human to review and manually tune the
// analysis prompt later - it is not a reinforcement learning loop.
const FeedbackRating: React.FC = () => {
  const { savedAnalysisId } = useSpeech();
  const { user } = useAuth();
  const [rating, setRating] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A ref (not state) guards re-entrancy synchronously - state-only guards leave a
  // window where several rapid clicks all fire before React re-renders the
  // disabled button, each independently submitting a duplicate row.
  const submitInFlight = useRef(false);

  // The component never unmounts between analyses (it's just conditionally
  // rendered), so without this, submitted/rating/comment from a previous
  // analysis's rating silently carried over and blocked rating the next one.
  useEffect(() => {
    setRating(null);
    setComment('');
    setSubmitted(false);
  }, [savedAnalysisId]);

  if (!user || !savedAnalysisId) {
    return null;
  }

  const handleRate = async (value: boolean) => {
    setRating(value);
  };

  const handleSubmit = async () => {
    if (rating === null || submitInFlight.current) return;
    submitInFlight.current = true;

    try {
      setIsSubmitting(true);
      await saveFeedbackRating({
        speechAnalysisId: savedAnalysisId,
        rating,
        comment,
      });
      setSubmitted(true);
      toast.success('Thanks for the feedback!');
    } catch (error) {
      // Postgres unique_violation - this analysis was already rated (e.g. a race,
      // or the form re-rendering after a remount). The desired end state already
      // holds, so treat it as success rather than a failure to retry.
      const isDuplicate = (error as { code?: string })?.code === '23505';
      if (isDuplicate) {
        setSubmitted(true);
        toast.info("You've already rated this analysis.");
      } else {
        console.error('Error submitting feedback rating:', error);
        toast.error('Failed to submit feedback. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      submitInFlight.current = false;
    }
  };

  if (submitted) {
    return (
      <Card className="shadow-md">
        <CardContent className="py-6 text-center text-gray-600">
          <MessageSquareText className="h-6 w-6 mx-auto mb-2 text-green-600" />
          Thanks — your feedback has been recorded.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Was this feedback helpful?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={rating === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleRate(true)}
            className={rating === true ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Helpful
          </Button>
          <Button
            type="button"
            variant={rating === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleRate(false)}
            className={rating === false ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Not helpful
          </Button>
        </div>

        {rating !== null && (
          <div className="space-y-3">
            <Textarea
              placeholder="Anything specific we should improve? (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[80px]"
            />
            <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FeedbackRating;
