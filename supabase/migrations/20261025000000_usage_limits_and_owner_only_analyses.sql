-- Daily usage counters for the edge functions' limits (see analyze-speech-openai/limits.ts).
-- RLS on with no policies, and the function revoked from app roles: only the
-- functions' service role can read or bump a counter.
CREATE TABLE public.usage_counts (
  key text NOT NULL,
  day date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
ALTER TABLE public.usage_counts ENABLE ROW LEVEL SECURITY;

-- Adds one use and returns true, or returns null (nothing added) once today's count has reached p_limit.
CREATE FUNCTION public.take_usage(p_key text, p_limit integer) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO usage_counts AS u (key, day, count) VALUES (p_key, current_date, 1)
  ON CONFLICT (key, day) DO UPDATE SET count = u.count + 1 WHERE u.count < p_limit
  RETURNING true;
$$;
REVOKE EXECUTE ON FUNCTION public.take_usage(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_usage(text, integer) TO service_role;

-- Analyses with no owner were readable, editable and deletable by anyone, and anyone
-- could add them. The app only saves analyses for signed-in users, so owner-only is enough.
DROP POLICY IF EXISTS "Users can view their own analyses" ON public.speech_analyses;
DROP POLICY IF EXISTS "Users can create analyses" ON public.speech_analyses;
DROP POLICY IF EXISTS "Users can update their own analyses" ON public.speech_analyses;
DROP POLICY IF EXISTS "Users can delete their own analyses" ON public.speech_analyses;

CREATE POLICY "Users can view their own analyses" ON public.speech_analyses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create analyses" ON public.speech_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own analyses" ON public.speech_analyses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own analyses" ON public.speech_analyses
  FOR DELETE USING (auth.uid() = user_id);
