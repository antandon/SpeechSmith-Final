-- Microphone recordings aren't capped in the browser, so anything the analysis
-- accepts (up to 25 MB, Whisper's limit) must also fit here or it can't be replayed.
UPDATE storage.buckets SET file_size_limit = 26214400 WHERE id = 'recordings';
