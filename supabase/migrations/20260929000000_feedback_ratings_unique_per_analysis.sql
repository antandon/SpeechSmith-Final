-- Defense-in-depth against duplicate rating submissions: the frontend now
-- guards against double-clicks with a ref, but a race is still possible
-- (multiple tabs, retried requests). One rating per user per analysis.

-- De-duplicate existing rows first - the double-submit bug this migration
-- guards against already produced real duplicates. Keep the earliest row per
-- (user_id, speech_analysis_id) pair; id breaks ties on identical timestamps.
DELETE FROM public.feedback_ratings a
USING public.feedback_ratings b
WHERE a.user_id = b.user_id
  AND a.speech_analysis_id = b.speech_analysis_id
  AND (a.created_at, a.id) > (b.created_at, b.id);

ALTER TABLE public.feedback_ratings
  ADD CONSTRAINT feedback_ratings_user_analysis_unique UNIQUE (user_id, speech_analysis_id);
