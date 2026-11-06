// OpenAI TTS service to replace Deepgram

export interface OpenAITTSResponse {
  audioUrl: string;
  success: boolean;
  error?: string;
}

export const generateSpeechFromText = async (
  text: string,
  // OpenAI fallback voice; the server uses Azure's American English voice first.
  voice: string = 'nova'
): Promise<OpenAITTSResponse> => {
  try {
    // Validate and sanitize voice - ensure it's a valid OpenAI voice
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const sanitizedVoice = validVoices.includes(voice) ? voice : 'nova';
    
    if (voice !== sanitizedVoice) {
      console.warn(`⚠️ Invalid voice "${voice}" provided, using "nova" instead`);
    }
    
    console.log('🔊 Generating speech with OpenAI TTS');
    console.log('🎤 Using voice:', sanitizedVoice);

    const { supabase } = await import('@/integrations/supabase/client');

    const { data, error } = await supabase.functions.invoke('openai-tts', {
      body: { text, voice: sanitizedVoice },
    });

    if (error) {
      console.error('❌ OpenAI TTS edge function error:', error);
      throw new Error(`OpenAI TTS error: ${error.message}`);
    }

    if (!data.success) {
      console.error('❌ OpenAI TTS API error:', data.error);
      throw new Error(`OpenAI TTS error: ${data.error}`);
    }

    // Convert base64 audio to blob and create URL
    const audioBlob = new Blob(
      [Uint8Array.from(atob(data.audioContent), (c) => c.charCodeAt(0))],
      { type: 'audio/mpeg' }
    );
    // The caller owns this URL - revoke it once the audio is replaced.
    const audioUrl = URL.createObjectURL(audioBlob);

    console.log('✅ OpenAI TTS successful, audio URL created');

    return {
      audioUrl,
      success: true,
    };
  } catch (error) {
    console.error('❌ Error generating speech with OpenAI:', error);
    return {
      audioUrl: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
