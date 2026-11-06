import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { openAISpeech, synthesizeSpeech } from "../analyze-speech-openai/azure.ts";
import { overLimit } from "../analyze-speech-openai/limits.ts";

// About 10 minutes of speech with its pause/stress markup - Azure's own per-request maximum.
const MAX_TEXT_LENGTH = 12000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const limitMessage = await overLimit(req, 'tts');
    if (limitMessage) return jsonError(limitMessage, 429);

    // Playback is American English only - any accent an older client sends is ignored.
    const { text, voice = 'nova' } = await req.json();

    if (typeof text !== 'string' || !text) {
      throw new Error('Text is required');
    }
    if (text.length > MAX_TEXT_LENGTH) return jsonError('This text is too long to read aloud.', 413);

    // Azure's US voice; OpenAI below if it isn't configured or fails.
    const azureKey = Deno.env.get('AZURE_SPEECH_KEY');
    const azureRegion = Deno.env.get('AZURE_SPEECH_REGION');
    if (azureKey && azureRegion) {
      try {
        return audioResponse(await synthesizeSpeech(text, azureKey, azureRegion, 'en-US'));
      } catch (error) {
        console.error('⚠️ Azure TTS failed, falling back to OpenAI:', error);
      }
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    return audioResponse(await openAISpeech(text, openaiApiKey, 'en-US', voice));
  } catch (error) {
    console.error('❌ Error in openai-tts:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function audioResponse(arrayBuffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(arrayBuffer);
  // Convert to base64 in chunks to avoid stack overflow
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binaryString += String.fromCharCode(...uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length)));
  }
  return new Response(
    JSON.stringify({ audioContent: btoa(binaryString), success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error, success: false }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
