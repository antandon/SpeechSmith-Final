-- New Supabase databases (including preview branches) no longer grant the API
-- roles access to public tables automatically, so a branch built from these
-- migrations had tables nobody could read or write. Production got these grants
-- from the old defaults; this states them explicitly. Row Level Security still
-- decides which rows each user can touch. usage_counts is deliberately left out:
-- only the take_usage function (security definer) reaches it.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.speech_analyses,
  public.testimonials,
  public.feedback_ratings
TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
