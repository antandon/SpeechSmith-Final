
import React, { createContext, useState, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { applySpokenRules } from '@/lib/analysis';

interface MistakeHighlight {
  timestamp: string;
  text: string;
  type: 'filler' | 'pronunciation' | 'repetition' | 'pace' | 'volume' | 'emotional';
  suggestion: string;
  // Words to say instead of a filler (filler entries only)
  alternatives?: string[];
}

export type SpeechPurposeKey = 'job-interview' | 'presentation' | 'speech' | 'reading-exercise' | 'other';

const SPEECH_CONFIG_KEY = 'speech_config';
// The user's last saved setup (practice-mode configs are never stored), or null.
export const storedSpeechConfig = (): SpeechConfig | null => {
  try { return JSON.parse(localStorage.getItem(SPEECH_CONFIG_KEY) || 'null'); } catch { return null; }
};

export interface SpeechConfig {
  topic: string;
  purpose: string;
  purposeKey: SpeechPurposeKey;
  audience: string;
  duration: string;
  tone: string;
  additionalContext?: string;
  // The exact question/prompt being answered in a practice mode, so content
  // feedback is judged against it rather than generically.
  practicePrompt?: string;
  // Reading exercise: the text being read, to check for skipped/extra/misread words.
  readingPassage?: string;
}

// Measured by Azure from the audio; absent when Azure didn't run.
export interface MeasuredDelivery {
  fluency: number | null;
  prosody: number | null;
  // null when Azure returned no intonation data (pitch wasn't measured).
  monotone: boolean | null;
  pauses: { word: string; previous: string; kind: 'unexpected' | 'missing' }[];
  weakSounds?: { sound: string; words: string[] }[];
  // Fields below are absent on reports saved before they existed.
  // Always en-US now; reports saved before US-only may hold another accent.
  accent?: string;
  soundScores?: Record<string, number>;
  sections?: { label: string; accuracy: number; pauseIssues: number }[];
  timing?: { word: string; kind: 'dragged' | 'clipped'; seconds: number }[];
}

export interface ReadingCheck {
  accuracy: number;
  skipped: string[];
  extra: string[];
  misread: { expected: string; said: string }[];
}

interface MispronuncedWord {
  word: string;
  correctWord?: string;
  confidence: number;
  phoneticCorrect: string;
  phoneticPronounced: string;
  suggestion: string;
  // Azure's 0-100 accuracy for the word (absent on older reports and text-only fallbacks).
  score?: number;
  // Which occurrence of the word in the transcript Azure flagged (0 = first); absent on older reports.
  occurrence?: number;
  syllables?: { text: string; score: number }[];
}

interface GrammarIssue {
  // "error" = a real mistake; "refinement" = correct but could be more polished.
  // Older saved sessions have no kind - treat those as errors.
  kind?: 'error' | 'refinement';
  original: string;
  corrected: string;
  errorType: string;
  explanation: string;
}

export interface GrammarAnalysisData {
  issues: GrammarIssue[];
  tips: string[];
  // True when the check itself failed - an empty list then means "not checked", not "no issues".
  unavailable?: boolean;
}

interface VocabularyStrength {
  word: string;
  context: string;
}

interface VocabularyWeakness {
  word: string;
  alternatives?: string[];
  betterPhrase?: string;
  idiom?: string;
  suggestion: string;
}

export interface VocabularyAnalysisData {
  strengths: VocabularyStrength[];
  weaknesses: VocabularyWeakness[];
  tips: string[];
  unavailable?: boolean;
}

interface EmphasisPhrase {
  phrase: string;
  reason: string;
  how?: string;
}

export interface EmphasisSuggestionsData {
  phrases: EmphasisPhrase[];
  tips: string[];
}

interface TonePhraseSuggestion {
  original: string;
  suggestedTone: string;
  rewritten: string;
  reason: string;
}

export interface ToneSuggestionsData {
  phrases: TonePhraseSuggestion[];
  tips: string[];
}

interface ContentQualityIssue {
  type: string;
  excerpt: string;
  problem?: string;
  suggestion: string;
  example?: string;
}

export interface ContextAlignment {
  status: 'aligned' | 'partial' | 'off-topic';
  summary: string;
  missingPoints: string[];
}

export interface ContentQualityAnalysisData {
  contextAlignment?: ContextAlignment | null;
  issues: ContentQualityIssue[];
  tips: string[];
  unavailable?: boolean;
}

interface FillerWordInstance {
  word: string;
  timestamp: string;
  count: number;
}

// Matches the backend's real ToneAnalysis shape (see ToneAnalysis in
// speechAnalysisUtils.ts) - these two fields are saved under both DB keys
// below for historical reasons, but both always hold this same object.
interface PitchAnalysis {
  primaryEmotion: string;
  formalityLevel: string;
  audienceSuitability: string;
  deliveryStyle: string;
  measured?: MeasuredDelivery;
  readingCheck?: ReadingCheck | null;
}

interface SpeakingRateAnalysis {
  wordsPerMinute: number;
  classification: 'too_slow' | 'optimal' | 'too_fast';
  actualWordCount: number;
  idealWordCount: number;
  assessment: 'under' | 'ideal' | 'over';
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
  speechDuration: number;
  sectionPace: SectionPace[];
  // false when Whisper gave no word timings, so pace/pauses are estimates; absent on older reports.
  measured?: boolean;
}

// The settings this report was analysed with, echoed by the server and saved with the report -
// cards read this, not the live speechConfig, so a reopened report shows its own context.
// accent: always en-US now; reports saved before US-only may hold another accent.
export type ReportConfig = Pick<SpeechConfig, 'purposeKey' | 'purpose' | 'practicePrompt' | 'topic'> & { accent?: string };

type EmotionAnalysis = PitchAnalysis;

export interface SpeechData {
  audioUrl: string | null;
  recordingDate: string;
  transcription?: string;
  improvedTranscription?: string;
  improvedTranscriptionClean?: string;
  improvedAudioUrl?: string;
  pronunciationAccuracy?: number;
  overallScore?: number;
  overallScoreRationale?: string;
  mispronuncedWords?: MispronuncedWord[];
  speakingRate?: SpeakingRateAnalysis;
  fillerWords?: FillerWordInstance[];
  pitchAnalysis?: PitchAnalysis;
  emotionAnalysis?: EmotionAnalysis;
  mistakes?: MistakeHighlight[];
  speechMetrics?: SpeechMetrics;
  analytics: {
    dates: string[];
    clarity: number[];
    pace: number[];
    fillerWords: number[];
    structure: number[];
    overallScores: number[];
    categoryScores: { name: string; value: number }[];
    commonFillerWords: { word: string; count: number }[];
  };
  feedback: Array<{
    category: string;
    score: number;
    feedback: string;
    color: string;
  }>;
  emphasisWords?: string[];
  grammarAnalysis?: GrammarAnalysisData;
  vocabularyAnalysis?: VocabularyAnalysisData;
  emphasisSuggestions?: EmphasisSuggestionsData;
  toneSuggestions?: ToneSuggestionsData;
  contentQualityAnalysis?: ContentQualityAnalysisData;
  // Absent on reports saved before it existed.
  speechConfig?: ReportConfig;
}

interface SpeechContextType {
  speechData: SpeechData | null;
  setSpeechData: React.Dispatch<React.SetStateAction<SpeechData | null>>;
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  hasRecorded: boolean;
  setHasRecorded: React.Dispatch<React.SetStateAction<boolean>>;
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  useAiAnalysis: boolean;
  setUseAiAnalysis: React.Dispatch<React.SetStateAction<boolean>>;
  aiSpeechUrl: string | null;
  setAiSpeechUrl: React.Dispatch<React.SetStateAction<string | null>>;
  speechConfig: SpeechConfig | null;
  setSpeechConfig: React.Dispatch<React.SetStateAction<SpeechConfig | null>>;
  apiProvider: 'openai' | 'gemini';
  setApiProvider: React.Dispatch<React.SetStateAction<'openai' | 'gemini'>>;
  loadHistoricalSession: (sessionId: string) => Promise<void>;
  isViewingHistorical: boolean;
  setIsViewingHistorical: React.Dispatch<React.SetStateAction<boolean>>;
  savedAnalysisId: string | null;
  setSavedAnalysisId: React.Dispatch<React.SetStateAction<string | null>>;
  // Guards against a slow analysis request writing its result into shared
  // context after the user has already switched modes or started a newer
  // recording - call beginNewRequest() when a new analysis starts, then
  // check isCurrentRequest(token) before writing the result.
  beginNewRequest: () => number;
  isCurrentRequest: (token: number) => boolean;
}

const SpeechContext = createContext<SpeechContextType | undefined>(undefined);

export const SpeechProvider = ({ children }: { children: ReactNode }) => {
  const [speechData, setSpeechData] = useState<SpeechData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const beginNewRequest = useCallback((): number => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);
  const isCurrentRequest = useCallback((token: number): boolean => {
    return requestIdRef.current === token;
  }, []);
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('speech_analysis_api_key') || '';
  });
  const [useAiAnalysis, setUseAiAnalysis] = useState(true); // Default to true - always use AI
  const [aiSpeechUrl, setAiSpeechUrl] = useState<string | null>(null);
  // The setup a user saved survives a reload. Practice modes set their own per-question
  // config, which isn't stored - the last saved setup comes back instead.
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig | null>(storedSpeechConfig);
  // Never removed here: a null config (e.g. American English picked with no setup) isn't
  // a user asking to forget their saved setup.
  useEffect(() => {
    if (!speechConfig || speechConfig.practicePrompt) return;
    try {
      localStorage.setItem(SPEECH_CONFIG_KEY, JSON.stringify(speechConfig));
    } catch { /* storage blocked - the setup just won't survive a reload */ }
  }, [speechConfig]);
  const [apiProvider, setApiProvider] = useState<'openai' | 'gemini'>(() => {
    return (localStorage.getItem('api_provider') as 'openai' | 'gemini') || 'gemini'; // Default to Gemini
  });

  // The live report's recording is a blob: URL - free it once the report is replaced or cleared.
  useEffect(() => {
    const url = speechData?.audioUrl;
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [speechData?.audioUrl]);

  // Restore a saved TTS URL only if it can outlive the page (data:/https:); a saved blob: URL is long dead.
  const persistentUrl = (url?: string) => (url && !url.startsWith('blob:') ? url : undefined);

  const loadHistoricalSession = async (sessionId: string) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('speech_analyses')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      if (data) {
        // Cast JSON data to proper types
        const analyticsData = data.analytics as any;
        const mistakesData = data.mistakes as any;
        const feedbackData = data.feedback as any;

        // Transform database data to SpeechData format
        const { getRecordingUrl } = await import('@/utils/speechDataService');
        const loadedData: SpeechData = {
          audioUrl: data.user_id ? await getRecordingUrl(data.user_id, data.id) : null,
          recordingDate: new Date(data.created_at).toISOString(),
          transcription: data.transcription || '',
          improvedTranscription: analyticsData?.improvedTranscription,
          improvedTranscriptionClean: analyticsData?.improvedTranscriptionClean,
          improvedAudioUrl: persistentUrl(analyticsData?.improvedAudioUrl),
          mispronuncedWords: analyticsData?.mispronuncedWords || [],
          pronunciationAccuracy: analyticsData?.pronunciationAccuracy,
          overallScore: analyticsData?.overallScore,
          overallScoreRationale: analyticsData?.overallScoreRationale,
          speakingRate: analyticsData?.speakingRate,
          fillerWords: analyticsData?.fillerWords || [],
          pitchAnalysis: analyticsData?.pitchAnalysis,
          emotionAnalysis: analyticsData?.emotionAnalysis,
          mistakes: mistakesData || [],
          feedback: feedbackData || [],
          speechMetrics: analyticsData?.speechMetrics || analyticsData?.speakingRate || undefined,
          analytics: analyticsData || {
            dates: [],
            clarity: [],
            pace: [],
            fillerWords: [],
            structure: [],
            overallScores: [],
            categoryScores: [],
            commonFillerWords: []
          },
          emphasisWords: analyticsData?.emphasisWords || [],
          grammarAnalysis: analyticsData?.grammarAnalysis,
          vocabularyAnalysis: analyticsData?.vocabularyAnalysis,
          emphasisSuggestions: analyticsData?.emphasisSuggestions,
          toneSuggestions: analyticsData?.toneSuggestions,
          contentQualityAnalysis: analyticsData?.contentQualityAnalysis,
          speechConfig: analyticsData?.speechConfig
        };

        setSpeechData(applySpokenRules(loadedData));
        setHasRecorded(true);
        setIsViewingHistorical(true);
        // So a rating given while viewing this report is saved against it,
        // not against whichever analysis was recorded last.
        setSavedAnalysisId(sessionId);
      }
    } catch (error) {
      console.error('Error loading historical session:', error);
      // Callers must know, or they'd go on to show whatever report was loaded before.
      throw error;
    }
  };

  return (
    <SpeechContext.Provider value={{ 
      speechData, 
      setSpeechData, 
      isProcessing, 
      setIsProcessing,
      hasRecorded,
      setHasRecorded,
      apiKey,
      setApiKey,
      useAiAnalysis,
      setUseAiAnalysis,
      aiSpeechUrl,
      setAiSpeechUrl,
      speechConfig,
      setSpeechConfig,
      apiProvider,
      setApiProvider,
      loadHistoricalSession,
      isViewingHistorical,
      setIsViewingHistorical,
      savedAnalysisId,
      setSavedAnalysisId,
      beginNewRequest,
      isCurrentRequest
    }}>
      {children}
    </SpeechContext.Provider>
  );
};

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (context === undefined) {
    throw new Error('useSpeech must be used within a SpeechProvider');
  }
  return context;
};
