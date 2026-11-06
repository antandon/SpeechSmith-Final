
import { supabase } from '@/integrations/supabase/client';

interface SpeechAnalysisData {
  title: string;
  transcription: string;
  mistakes: any[];
  feedback: any[];
  analytics: any;
  audio?: Blob;
}

// Recordings live at recordings/<user_id>/<speech_analysis_id> (see the
// recordings_bucket migration), so the path never needs storing.
const recordingPath = (userId: string, analysisId: string) => `${userId}/${analysisId}`;

// Signed URL for a saved analysis' original recording, or null for sessions
// saved before recordings were kept (or whose upload failed).
export const getRecordingUrl = async (userId: string, analysisId: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(recordingPath(userId, analysisId), 60 * 60);
  return error ? null : data.signedUrl;
};

export const saveSpeechAnalysis = async (data: SpeechAnalysisData) => {
  try {
    const { data: result, error } = await supabase
      .from('speech_analyses')
      .insert([{
        title: data.title,
        transcription: data.transcription,
        mistakes: data.mistakes,
        feedback: data.feedback,
        analytics: data.analytics,
        user_id: (await supabase.auth.getUser()).data.user?.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving speech analysis:', error);
      throw error;
    }

    // The analysis is saved either way - a failed upload only costs playback later.
    if (data.audio && result.user_id) {
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(recordingPath(result.user_id, result.id), data.audio, { contentType: data.audio.type || 'audio/webm' });
      if (uploadError) console.warn('Recording upload failed:', uploadError);
    }

    return result;
  } catch (error) {
    console.error('Error in saveSpeechAnalysis:', error);
    throw error;
  }
};

export const saveFeedbackRating = async ({
  speechAnalysisId,
  rating,
  comment,
}: {
  speechAnalysisId: string;
  rating: boolean;
  comment?: string;
}) => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error('Must be signed in to rate feedback');
  }

  const { data: result, error } = await supabase
    .from('feedback_ratings')
    .insert([{
      speech_analysis_id: speechAnalysisId,
      rating,
      comment: comment?.trim() || null,
      user_id: userId,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving feedback rating:', error);
    throw error;
  }

  return result;
};

export const getUserSpeechAnalyses = async () => {
  try {
    const { data, error } = await supabase
      .from('speech_analyses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching speech analyses:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserSpeechAnalyses:', error);
    throw error;
  }
};
