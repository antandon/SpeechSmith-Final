
import { supabase } from '@/integrations/supabase/client';
import { generateSpeechFromText } from './openaiTTS';
import type { ReportConfig, GrammarAnalysisData, VocabularyAnalysisData, EmphasisSuggestionsData, ToneSuggestionsData, ContentQualityAnalysisData, MeasuredDelivery, ReadingCheck } from '@/context/SpeechContext';

interface MispronuncedWord {
  word: string;
  confidence: number;
  phoneticCorrect: string;
  phoneticPronounced: string;
  suggestion: string;
  occurrence?: number;
  syllables?: { text: string; score: number }[];
}

interface PauseEvent {
  timestamp: string;
  durationSeconds: number;
}

interface SectionPace {
  label: string;
  wordsPerMinute: number;
}

interface SpeechMetrics {
  totalWords: number;
  wordsPerMinute: number;
  totalPauses: number;
  pauseTimestamps: PauseEvent[];
  pronunciationAccuracy: number;
  fillerWordPercentage: number;
  speechDuration: number;
  sectionPace: SectionPace[];
}

interface ToneAnalysis {
  primaryEmotion: string;
  formalityLevel: string;
  audienceSuitability: string;
  deliveryStyle: string;
  measured?: MeasuredDelivery;
  readingCheck?: ReadingCheck | null;
}

interface ComprehensiveAnalysisResponse {
  transcription: string;
  improvedTranscription?: string;
  improvedTranscriptionClean?: string;
  improvedAudioUrl?: string;
  overallScore?: number;
  overallScoreRationale?: string;
  speechMetrics?: SpeechMetrics;
  toneAnalysis?: ToneAnalysis;
  toneSuggestions?: ToneSuggestionsData;
  mispronuncedWords?: MispronuncedWord[];
  mistakes: {
    timestamp: string;
    text: string;
    type: 'filler' | 'pronunciation' | 'repetition' | 'pace' | 'volume' | 'emotional';
    suggestion: string;
    alternatives?: string[];
  }[];
  feedback: {
    category: string;
    score: number;
    feedback: string;
    color: string;
  }[];
  analytics: {
    categoryScores: { name: string; value: number }[];
    commonFillerWords: { word: string; count: number }[];
  };
  grammarAnalysis?: GrammarAnalysisData;
  vocabularyAnalysis?: VocabularyAnalysisData;
  emphasisSuggestions?: EmphasisSuggestionsData;
  contentQualityAnalysis?: ContentQualityAnalysisData;
  // The settings the server analysed with; absent from older servers.
  speechConfig?: ReportConfig;
}

// Helper function to convert Blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const LOUDNESS_FRAME_SECONDS = 0.05;
const PCM_SAMPLE_RATE = 16000;
// ponytail: 16kHz PCM is ~43KB/s as base64 on top of the original upload, so
// longer recordings skip Azure and keep the GPT pronunciation estimate. Raise
// this (or send OGG/Opus instead) if long recordings need measured scores.
const MAX_PCM_SECONDS = 180;

// 16kHz mono 16-bit PCM of the recording - the format Azure's pronunciation
// assessment requires, which the server can't produce from webm itself.
const toPcm16kBase64 = async (audio: AudioBuffer): Promise<string | undefined> => {
  if (audio.duration > MAX_PCM_SECONDS) return undefined;
  const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * PCM_SAMPLE_RATE), PCM_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = audio;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

// RMS loudness per 50ms frame of the recording, so the server can tell which
// exact words the speaker's voice dropped on, plus the PCM for Azure. Optional -
// if the browser can't decode the format, analysis just runs without them.
const decodeForAnalysis = async (blob: Blob): Promise<{ loudness?: { frameSeconds: number; rms: number[] }; pcm16kBase64?: string }> => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return {};
    const context = new AudioCtx();
    try {
      const audio = await context.decodeAudioData(await blob.arrayBuffer());
      const pcm16kBase64 = await toPcm16kBase64(audio).catch(error => {
        console.warn('⚠️ Could not prepare 16kHz audio; pronunciation will be estimated', error);
        return undefined;
      });
      const frameSize = Math.max(1, Math.round(audio.sampleRate * LOUDNESS_FRAME_SECONDS));
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const rms: number[] = [];
      for (let start = 0; start < audio.length; start += frameSize) {
        const end = Math.min(start + frameSize, audio.length);
        let sum = 0;
        for (const data of channels) {
          for (let i = start; i < end; i++) sum += data[i] * data[i];
        }
        rms.push(Math.round(Math.sqrt(sum / ((end - start) * channels.length)) * 10000) / 10000);
      }
      return { loudness: { frameSeconds: frameSize / audio.sampleRate, rms }, pcm16kBase64 };
    } finally {
      context.close().catch(() => {});
    }
  } catch (error) {
    console.warn('⚠️ Could not decode audio; volume highlights and measured pronunciation will be skipped', error);
    return {};
  }
};

export const analyzeWithSelectedProvider = async (
  audioBlob: Blob, 
  apiKey: string, 
  apiProvider: 'openai' | 'gemini',
  speechConfig?: any
): Promise<ComprehensiveAnalysisResponse> => {
  console.log(`🎤 Starting comprehensive analysis with ${apiProvider}...`);

  // Convert audio to base64
  const [audioBase64, { loudness, pcm16kBase64 }] = await Promise.all([blobToBase64(audioBlob), decodeForAnalysis(audioBlob)]);

  // Use Supabase edge function for OpenAI analysis (always use this now)
  if (apiProvider === 'openai' || apiProvider === 'gemini') {

    const body = {
      audioBase64,
      speechConfig,
      mimeType: audioBlob.type || 'audio/webm',
      loudness,
      pcm16kBase64
    };
    // Local development only: point at a locally running copy of the edge
    // function instead of the deployed one.
    const localFunctionUrl = import.meta.env.VITE_ANALYZE_FUNCTION_URL;
    const { data, error } = localFunctionUrl
      ? await fetch(localFunctionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(async r => {
            const json = await r.json().catch(() => null);
            return r.ok ? { data: json, error: null } : { data: null, error: new Error(json?.error || `HTTP ${r.status}`) };
          })
      : await supabase.functions.invoke('analyze-speech-openai', { body });

    if (error) {
      console.error('❌ Speech analysis edge function error:', error);
      let details = error.message;
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) details = body.error;
      } catch (_) { /* ignore */ }
      throw new Error(`Speech analysis failed: ${details}`);
    }

    if (!data) {
      console.error('❌ No data received from OpenAI analysis');
      throw new Error('No data received from OpenAI analysis');
    }

    console.log('✅ Received comprehensive analysis from OpenAI');

// Derive the clean improved text, and audio for it if the server sent none
if (data.improvedTranscription && data.improvedTranscription.trim() !== '') {
  // Decide TTS input
  const annotated = data.improvedTranscription;
  const fromServerClean = (data as any).improvedTranscriptionClean as string | undefined;

  // Try extracting clean text from embedded JSON if present
  let fromEmbeddedClean: string | undefined;
  try {
    const jsonMatch = annotated.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      if (typeof extracted.improvedTextClean === 'string') {
        fromEmbeddedClean = extracted.improvedTextClean;
      }
      if (typeof extracted.improvedTextWithAnnotations === 'string' && !fromServerClean && !fromEmbeddedClean) {
        // keep as potential annotated source if needed
      }
    }
  } catch (e) {
    console.log('🧩 Failed to parse embedded JSON for improvedTextClean:', e);
  }

  // Frontend cleaning fallback (mirrors edge function) - strips the |, **, *, [[ ]] markup
  const frontendClean = annotated
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\([^)]*\)\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/_/g, '')
    .replace(/__|~~|`/g, '')
    .replace(/\b(pause|emphasis|confident|slower|faster|breathe|slight)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])\s*/g, '$1 ')
    .trim();

  const pickFirstNonEmpty = (...candidates: (string | undefined)[]) => {
    for (const c of candidates) {
      if (c && c.trim().length > 0) return c.trim();
    }
    return '';
  };

  const ttsText = pickFirstNonEmpty(fromServerClean, fromEmbeddedClean, frontendClean);
  (data as any).improvedTranscriptionClean = ttsText;

  // The server already voices it - only fill in if it couldn't.
  if (!data.improvedAudioUrl) {
    try {
      const audioResult = await generateSpeechFromText(annotated, 'nova');
      if (audioResult.success) {
        data.improvedAudioUrl = audioResult.audioUrl;
      } else {
        console.warn('⚠️ Failed to generate improved speech audio:', audioResult.error);
      }
    } catch (error) {
      console.warn('⚠️ Error generating improved speech audio:', error);
    }
  }
}
    
    return data as ComprehensiveAnalysisResponse;
  }
  throw new Error(`Unknown analysis provider: ${apiProvider}`);
};
