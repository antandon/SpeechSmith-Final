-- Feedback ratings: lets a user rate the AI coaching feedback they received
-- (thumbs up/down + optional free-text comment) so it can be reviewed later
-- to manually tune the analysis prompt. This is feedback logging, not
-- reinforcement learning - nothing here retrains or auto-tunes anything.
CREATE TABLE public.feedback_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  speech_analysis_id UUID NOT NULL REFERENCES public.speech_analyses(id) ON DELETE CASCADE,
  rating BOOLEAN NOT NULL, -- true = thumbs up, false = thumbs down
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own feedback ratings"
  ON public.feedback_ratings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback ratings"
  ON public.feedback_ratings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX feedback_ratings_speech_analysis_id_idx ON public.feedback_ratings(speech_analysis_id);

-- ============================================================================
-- Manual review queries (run in the Supabase SQL Editor, which uses the
-- service_role and so bypasses the user-scoped RLS policies above).
-- There is no dashboard for this - it's meant to be reviewed by hand
-- periodically to spot patterns and manually tune the analysis prompt.
-- ============================================================================

-- All "not helpful" ratings with a comment, most recent first:
-- SELECT fr.id, fr.comment, fr.created_at, fr.speech_analysis_id, sa.title
-- FROM public.feedback_ratings fr
-- JOIN public.speech_analyses sa ON sa.id = fr.speech_analysis_id
-- WHERE fr.rating = false AND fr.comment IS NOT NULL AND fr.comment <> ''
-- ORDER BY fr.created_at DESC;

-- Helpful vs. not-helpful counts overall:
-- SELECT rating, count(*) FROM public.feedback_ratings GROUP BY rating;
