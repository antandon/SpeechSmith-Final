-- Original speech recordings, so a past report can still play back what the
-- user actually said. Private bucket; each file lives at
-- <user_id>/<speech_analysis_id>, and users can only touch their own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('recordings', 'recordings', false, 10485760) -- 10MB, same cap as the upload UI
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own recordings"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own recordings"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own recordings"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
