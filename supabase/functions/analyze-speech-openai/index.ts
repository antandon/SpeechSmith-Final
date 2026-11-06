import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assessPronunciation, compareReading, openAISpeech, synthesizeSpeech, type Locale, type PronunciationResult } from "./azure.ts";
import { overLimit } from "./limits.ts";
import { isFillerLike, punctuatedWords, pauseInstead, isHesitation, isFillerOnly, keepsSpeakersWords, withoutInventedStats, changedWords, classifyGrammarFix, consistentAlignmentStatus, courtesyContentIssue, grammarVerdict, isCourtesy, isWrittenOnlyIssue, NOT_SPOKEN_GRAMMAR, spokenWords, NOT_GRAMMAR_TIP } from "./spoken.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API = 'https://api.openai.com/v1';
const CHAT_MODEL = 'gpt-4o-mini';

interface MispronuncedWord {
  word: string;
  correctWord?: string;
  confidence: number;
  phoneticCorrect: string;
  phoneticPronounced: string;
  suggestion: string;
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

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

// Gaps between words at or above this many seconds count as a real pause.
const PAUSE_THRESHOLD_SECONDS = 0.5;

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Deliberately narrow: only hesitation sounds and "basically"/"literally", which are filler in
// (nearly) every context ("like" is counted only in filler use - see isFillerLike). Words like "just", "really", "very", "actually" are only
// sometimes filler and mostly legitimate ("I really enjoy", "very cold"), so
// counting them unconditionally produced false positives - dropped rather
// than guessed at with unreliable heuristics. Same list createManualImprovement()
// strips from the "improved" version - one definition of "what counts as filler".
// Stored the way normalizeWhisperWord spells them (doubled letters collapsed: "literaly").
const FILLER_WORDS = ['um', 'uh', 'basically', 'literally'];
const FILLER_DISPLAY = new Map(FILLER_WORDS.map(w => [w.replace(/(.)\1+/g, '$1'), w]));
const FILLER_SINGLE_WORDS = new Set(FILLER_DISPLAY.keys());
const FILLER_PHRASES: [string, string][] = [
  ['you', 'know'],
];

// Whisper sometimes renders a filler with stray punctuation, a trailing
// possessive-looking "'s" (e.g. "UM's"), or elongation from natural speech
// (e.g. "ummm", "uhhh"). Normalize all of that before matching so these still
// count instead of silently slipping past the filler-word list - collapsing
// repeated letters only affects the few words checked against the filler
// list below, so it can't mangle unrelated words elsewhere in the transcript.
const normalizeWhisperWord = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z']/g, '').replace(/'s$/, '').replace(/(.)\1+/g, '$1');

// The rewrite step (an LLM asked to remove filler words from free text) has
// proven unreliable at recognizing "um's"/"uh's" - the same Whisper
// possessive-looking artifact normalizeWhisperWord() strips for detection -
// as the filler word it is. Deterministic safety net applied after the LLM
// call, since read-aloud speaks this text and it must never say "UM's".
// Handles the filler alone or fully wrapped in **bold**/*italic* markup so
// stripping it doesn't leave empty/stray markers behind.
const stripResidualFillerPossessives = (text: string): string =>
  text
    .replace(/\*\*\s*(um|uh)'s\s*\*\*\s*/gi, '')
    .replace(/\*\s*(um|uh)'s\s*\*\s*/gi, '')
    .replace(/\b(um|uh)'s\b\s*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

interface DetectedFillerMistake {
  timestamp: string;
  text: string;
  type: 'filler';
  suggestion: string;
  alternatives?: string[];
}

// Used when the LLM doesn't return context-specific alternatives for a filler:
// a fixed list of connectors ("moreover") rarely fit the sentence, a silent pause always does.
const DEFAULT_FILLER_ALTERNATIVES: string[] = [];

const FILLER_CONTEXT_WORDS = 6;
const MAX_FILLER_ALTERNATIVE_WORDS = 3;
const FORMAL_CONNECTORS = /^(moreover|furthermore|consequently|additionally|in addition|thus|hence|therefore|as a result|nevertheless|however)\b/i;

const buildFillerSuggestion = (filler: string, alternatives: string[]): string =>
  alternatives.length > 0
    ? `Instead of "${filler}", try ${alternatives.map(a => `"${a}"`).join(', ')} - or simply pause`
    : pauseInstead(filler);

// "you know" is only filler when it isn't part of the sentence: "do you know",
// "as you know", "you know that ...", "you know what to do" are real meaning.
const YOU_KNOW_REAL_BEFORE = new Set(['do', 'did', 'dont', "don't", 'as', 'if', 'would', 'could', 'what', 'whether']);
const YOU_KNOW_REAL_AFTER = new Set(['that', 'what', 'how', 'the', 'why', 'where', 'who', 'when', 'about', 'if', 'whether']);
// A comma after "know" ("you know, ...") marks it as an aside whatever follows.
const isFillerYouKnow = (prev: string, knowRaw: string, after: string) =>
  !YOU_KNOW_REAL_BEFORE.has(prev) && (/,\s*$/.test(knowRaw) || !YOU_KNOW_REAL_AFTER.has(after));

// Detects filler words directly from Whisper's real per-word timestamps
// instead of asking the LLM to guess both which words are fillers and where
// they occurred in the audio - the LLM can only estimate position from text,
// which produces timestamps that don't match the actual recording.
function detectFillerWordsFromAudio(words: WhisperWord[], transcription: string): {
  mistakes: DetectedFillerMistake[];
  commonFillerWords: { word: string; count: number }[];
  // Surrounding words for each entry in `mistakes` (same index), so the LLM can
  // suggest alternatives that actually fit the sentence the filler sits in.
  contexts: { before: string; after: string }[];
} {
  const mistakes: DetectedFillerMistake[] = [];
  const contexts: { before: string; after: string }[] = [];
  const counts = new Map<string, number>();
  // Whisper's words have no commas - "is, like, really" needs them back to tell filler from "I like it".
  const raw = punctuatedWords(words.map(w => w.word), transcription);

  const record = (canonical: string, displayText: string, startIdx: number, length: number) => {
    mistakes.push({
      timestamp: formatTimestamp(words[startIdx].start),
      text: displayText,
      type: 'filler',
      suggestion: buildFillerSuggestion(displayText, DEFAULT_FILLER_ALTERNATIVES),
      alternatives: DEFAULT_FILLER_ALTERNATIVES,
    });
    contexts.push({
      before: words.slice(Math.max(0, startIdx - FILLER_CONTEXT_WORDS), startIdx).map(w => w.word.trim()).join(' '),
      after: words.slice(startIdx + length, startIdx + length + FILLER_CONTEXT_WORDS).map(w => w.word.trim()).join(' '),
    });
    counts.set(canonical, (counts.get(canonical) || 0) + 1);
  };

  let i = 0;
  while (i < words.length) {
    const current = normalizeWhisperWord(words[i].word);
    const next = words[i + 1] ? normalizeWhisperWord(words[i + 1].word) : '';

    const phraseMatch = FILLER_PHRASES.find(([a, b]) => a === current && b === next);
    const prev = i > 0 ? normalizeWhisperWord(words[i - 1].word) : '';
    const after = words[i + 2] ? normalizeWhisperWord(words[i + 2].word) : '';
    if (phraseMatch && isFillerYouKnow(prev, raw[i + 1], after)) {
      record(phraseMatch.join(' '), `${words[i].word.trim()} ${words[i + 1].word.trim()}`, i, 2);
      i += 2;
      continue;
    }

    if (FILLER_SINGLE_WORDS.has(current)) {
      // Counted under the real word - `current` has doubled letters collapsed ("basicaly").
      record(FILLER_DISPLAY.get(current) ?? current, words[i].word.trim(), i, 1);
    } else if (current === 'like' && isFillerLike(raw[i - 1] ?? '', raw[i], raw[i + 1] ?? '')) {
      record('like', words[i].word.trim(), i, 1);
    }
    i += 1;
  }

  return {
    mistakes,
    commonFillerWords: Array.from(counts.entries()).map(([word, count]) => ({ word, count })),
    contexts,
  };
}

interface DeliveryMistake {
  timestamp: string;
  text: string;
  type: 'pace' | 'repetition';
  suggestion: string;
}

// Loudness profile measured in the browser from the same recording: one RMS
// value per `frameSeconds` of audio, aligned with Whisper's timestamps.
interface LoudnessProfile {
  frameSeconds: number;
  rms: number[];
}

// Words on each side used to judge a word's local pace, and the shortest run worth flagging.
const PACE_SMOOTHING_WORDS = 2;
const MIN_PACE_RUN_WORDS = 6;
// Per-word rate excludes the pauses between phrases, so it runs well above a
// speaker's overall WPM - a candidate stretch is only reported if its real
// rate (pauses included) is also outside the normal range.
const FAST_WORD_RATE = 230;
const SLOW_WORD_RATE = 80;
const FAST_WPM = 190;
// Whisper squeezes word timings on short stretches, so a run must last this long to count -
// unless it's long enough (2x MIN_PACE_RUN_WORDS) that its timing is reliable anyway.
const MIN_PACE_RUN_SECONDS = 3;
// WPM alone calls a run of short words ("and I will do it") rushed; real fast speech is
// above ~6 syllables a second. Vowel groups are a rough syllable count, close enough here.
const FAST_SYLLABLES_PER_SECOND = 6;
const syllables = (word: string) => Math.max(1, (word.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
// Pace score from measured WPM: 100 inside the comfortable range, minus 1 per WPM outside it.
const IDEAL_WPM = { min: 120, max: 160 };
const paceScoreFor = (wpm: number) => Math.max(20, 100 - Math.max(0, IDEAL_WPM.min - wpm, wpm - IDEAL_WPM.max));
const SLOW_WPM = 80;
// Filler score from the filler rate: 100 with none, -7 per percent of words that were filler
// (2 per 100 words stays green, over 5 turns red - same bands as the filler card).
const fillerScoreFor = (count: number, words: number) => Math.max(20, Math.round(100 - 7 * (count / Math.max(words, 1)) * 100));
const MIN_WORDS_FOR_DELIVERY_ISSUES = 16;
const MAX_ISSUES_PER_DELIVERY_TYPE = 4;
// Real doubled words that aren't stumbles ("I had had enough", "I know that that is...").
const LEGIT_DOUBLED_WORDS = new Set(['had', 'that']);

const plainWord = (w: WhisperWord) => w.word.trim().replace(/^[^\w']+|[^\w']+$/g, '');
const spanText = (words: WhisperWord[], from: number, to: number) =>
  words.slice(from, to + 1).map(plainWord).filter(Boolean).join(' ');

// Pace and repetition issues located on exact words, from Whisper's real
// per-word timing - so the transcript can highlight them instead of only
// describing them in general.
function detectDeliveryIssuesFromAudio(words: WhisperWord[]): DeliveryMistake[] {
  if (words.length < MIN_WORDS_FOR_DELIVERY_ISSUES) return [];
  const issues: DeliveryMistake[] = [];

  // Pace: each word's "slot" is the time until the next word starts. A word is
  // rushed/dragging when the median slot of the words around it is - the median
  // keeps one natural pause between sentences from flagging a whole stretch.
  const slots = words.map((w, i) => (i < words.length - 1 ? words[i + 1].start : w.end) - w.start);
  const localSlot = (i: number) => {
    const around = slots.slice(Math.max(0, i - PACE_SMOOTHING_WORDS), i + PACE_SMOOTHING_WORDS + 1).sort((a, b) => a - b);
    return around[Math.floor(around.length / 2)];
  };
  const paceKind = words.map((_, i): 'fast' | 'slow' | null => {
    const slot = localSlot(i);
    return slot > 0 && 60 / slot > FAST_WORD_RATE ? 'fast' : 60 / slot < SLOW_WORD_RATE ? 'slow' : null;
  });
  // Smoothing lets a run spill onto neighbouring words; trim edge words whose
  // own timing doesn't match the run (e.g. the word before a sentence pause).
  const ownKind = (i: number) => {
    const rate = slots[i] > 0 ? 60 / slots[i] : Infinity;
    return rate > FAST_WORD_RATE ? 'fast' : rate < SLOW_WORD_RATE ? 'slow' : null;
  };
  let paceCount = { fast: 0, slow: 0 };
  for (let i = 0; i < words.length;) {
    const kind = paceKind[i];
    let end = i;
    while (end + 1 < words.length && paceKind[end + 1] === kind) end++;
    let from = i;
    let to = end;
    while (kind && from < to && ownKind(from) !== kind) from++;
    while (kind && to > from && ownKind(to) !== kind) to--;
    const runSeconds = words[to].end - words[from].start;
    const wpm = Math.round(((to - from + 1) / Math.max(runSeconds, 0.1)) * 60);
    const syllableRate = words.slice(from, to + 1).reduce((n, w) => n + syllables(plainWord(w)), 0) / Math.max(runSeconds, 0.1);
    const reliable = runSeconds >= MIN_PACE_RUN_SECONDS || to - from + 1 >= 2 * MIN_PACE_RUN_WORDS;
    const confirmed = reliable && (kind === 'fast'
      ? wpm > FAST_WPM && syllableRate > FAST_SYLLABLES_PER_SECOND
      : kind === 'slow' && wpm < SLOW_WPM);
    if (kind && confirmed && to - from + 1 >= MIN_PACE_RUN_WORDS && paceCount[kind] < MAX_ISSUES_PER_DELIVERY_TYPE) {
      paceCount = { ...paceCount, [kind]: paceCount[kind] + 1 };
      issues.push({
        timestamp: formatTimestamp(words[from].start),
        text: spanText(words, from, to),
        type: 'pace',
        suggestion: kind === 'fast'
          ? `Rushed (~${wpm} WPM) - slow down to around 130-150 WPM here and add a short pause between ideas`
          : `Dragging (~${wpm} WPM) with long gaps - keep this stretch moving and plan the next point before you pause`,
      });
    }
    i = end + 1;
  }

  // Repetition: a word or 2-3 word phrase immediately said again ("I I", "we can we can").
  const normalized = words.map(w => normalizeWhisperWord(w.word));
  // Plain lowercase for repetition: normalizeWhisperWord collapses letters, so "to too" would match.
  const lower = words.map(w => plainWord(w).toLowerCase());
  const repetitions: DeliveryMistake[] = [];
  for (let i = 0; i < words.length && repetitions.length < MAX_ISSUES_PER_DELIVERY_TYPE; i++) {
    for (const n of [3, 2, 1]) {
      if (i + 2 * n > words.length) continue;
      const first = lower.slice(i, i + n);
      const second = lower.slice(i + n, i + 2 * n);
      if (first.some(w => !w || FILLER_SINGLE_WORDS.has(normalizeWhisperWord(w))) || first.join(' ') !== second.join(' ')) continue;
      if (n === 1 && LEGIT_DOUBLED_WORDS.has(first[0])) continue;
      const phrase = spanText(words, i, i + n - 1);
      repetitions.push({
        timestamp: formatTimestamp(words[i].start),
        text: spanText(words, i, i + 2 * n - 1),
        type: 'repetition',
        suggestion: `"${phrase}" was said twice in a row - pause silently to collect your thought, then say it once`,
      });
      i += 2 * n - 1;
      break;
    }
  }
  issues.push(...repetitions);

  return issues;
}

// Average loudness of the audio under each word.
const wordLevels = (words: WhisperWord[], loudness: LoudnessProfile) => words.map(w => {
  const from = Math.max(0, Math.floor(w.start / loudness.frameSeconds));
  const to = Math.min(loudness.rms.length, Math.max(from + 1, Math.ceil(w.end / loudness.frameSeconds)));
  const frames = loudness.rms.slice(from, to);
  return frames.length > 0 ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
});

// On a silent recording Whisper can invent whole sentences ("Five different audiences.")
// with confident timestamps. Real words are louder than the recording's background;
// invented ones sit on silence. True when most "words" are no louder than the background.
const SPEECH_OVER_FLOOR = 2;
const MIN_SPEECH_RMS = 0.004; // about -48 dBFS; near-silent mics report 0.000x
function wordsAreSilent(words: WhisperWord[], loudness: LoudnessProfile | null): boolean {
  if (!loudness || loudness.rms.length === 0 || words.length === 0) return false;
  const sorted = [...loudness.rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const threshold = Math.max(floor * SPEECH_OVER_FLOOR, MIN_SPEECH_RMS);
  const audible = wordLevels(words, loudness).filter(level => level > threshold).length;
  return audible < words.length * 0.3;
}

const validateLoudness = (raw: any): LoudnessProfile | null =>
  raw && typeof raw.frameSeconds === 'number' && raw.frameSeconds > 0 && Array.isArray(raw.rms)
    ? { frameSeconds: raw.frameSeconds, rms: raw.rms.map((v: any) => (typeof v === 'number' && isFinite(v) ? v : 0)) }
    : null;

// Builds real speech metrics from Whisper's word-level timestamps instead of
// letting the LLM guess pace/pauses from the transcript text alone.
function computeMetricsFromWords(words: WhisperWord[], audioDuration: number): Pick<SpeechMetrics, 'totalWords' | 'wordsPerMinute' | 'totalPauses' | 'pauseTimestamps' | 'speechDuration' | 'sectionPace'> {
  const totalWords = words.length;
  const speechDuration = audioDuration || (words.length > 0 ? words[words.length - 1].end : 0);
  // Pace over the time actually spent speaking: silence before the first word and
  // after the last (mic warm-up, reaching for stop) isn't slow speech.
  const speakingSpan = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
  const wordsPerMinute = speakingSpan > 0 ? Math.round((totalWords / speakingSpan) * 60) : 0;

  const pauseTimestamps: PauseEvent[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap >= PAUSE_THRESHOLD_SECONDS) {
      const timestamp = formatTimestamp(words[i].end);
      const last = pauseTimestamps[pauseTimestamps.length - 1];
      // Two pauses around one short word ("... um ...") land in the same second - one hesitation, not two "0:14"s.
      if (last?.timestamp === timestamp) last.durationSeconds = Math.round((last.durationSeconds + gap) * 10) / 10;
      else pauseTimestamps.push({ timestamp, durationSeconds: Math.round(gap * 10) / 10 });
    }
  }

  // Split into thirds so feedback can point at "the opening", "the middle", "the close".
  // Requires enough words for each third to be a meaningful sample - splitting 1-2
  // words into "sections" produces wildly noisy, self-contradictory WPM values.
  const sectionLabels = ['Opening', 'Middle', 'Closing'];
  const sectionPace: SectionPace[] = [];
  const MIN_WORDS_FOR_SECTION_PACE = 9;
  if (totalWords >= MIN_WORDS_FOR_SECTION_PACE) {
    const sectionSize = Math.ceil(totalWords / 3);
    for (let i = 0; i < 3; i++) {
      const sectionWords = words.slice(i * sectionSize, (i + 1) * sectionSize);
      if (sectionWords.length === 0) continue;
      // A section runs until the next one starts, so the pause between them counts -
      // otherwise every section reads faster than the overall pace.
      const next = words[(i + 1) * sectionSize];
      const sectionDuration = (next ? next.start : sectionWords[sectionWords.length - 1].end) - sectionWords[0].start;
      const sectionWpm = sectionDuration > 0 ? Math.round((sectionWords.length / sectionDuration) * 60) : 0;
      sectionPace.push({ label: sectionLabels[i], wordsPerMinute: sectionWpm });
    }
    // A zero-length section means the word timings are broken - no "0 WPM" sections.
    if (sectionPace.some(sp => sp.wordsPerMinute === 0)) sectionPace.length = 0;
  }

  return {
    totalWords,
    wordsPerMinute,
    totalPauses: pauseTimestamps.length,
    pauseTimestamps,
    speechDuration: Math.round(speechDuration),
    sectionPace,
  };
}

// One retry for transient upstream/gateway failures between Supabase and
// OpenAI (e.g. "upstream connect error... connection timeout", a 502/503/504)
// - not for rate limits, billing, or real client errors, where retrying
// immediately won't help and the existing status-specific handling should apply.
async function transcribeWithRetry(formData: FormData, apiKey: string, maxAttempts = 2): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${OPENAI_API}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });
      if (!response.ok && [502, 503, 504].includes(response.status) && attempt < maxAttempts) {
        console.warn(`⚠️ Transcription attempt ${attempt} failed with ${response.status}, retrying once...`);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.warn(`⚠️ Transcription attempt ${attempt} threw a network error, retrying once...`, error);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Transcription retry loop exited unexpectedly');
}

const WHISPER_PROMPT = 'Um, I think, uh, this is a natural conversational recording that may include filler words like um, uh, and you know.';
// Whisper's own default silence cut-off. ponytail: one global knob - raise it
// if quiet real speech gets discarded, lower it if silence still slips through.
const NO_SPEECH_THRESHOLD = 0.6;
const WHISPER_PROMPT_WORDS = new Set(WHISPER_PROMPT.toLowerCase().match(/[a-z']+/g));

// True when (nearly) every transcript word comes from the prompt - Whisper
// hallucinating its prompt back on silence, e.g. "This is a natural
// conversation that may include filler words like um, uh, and you know."
function echoesWhisperPrompt(text: string): boolean {
  const words = (text || '').toLowerCase().match(/[a-z']+/g) ?? [];
  return words.length > 0 && words.filter(w => WHISPER_PROMPT_WORDS.has(w)).length / words.length >= 0.8;
}

// Whisper's confidence in its own transcript (mean log-probability per token, weighted by
// segment length). Clear speech measures about -0.2 to -0.45, noisy but intelligible speech
// about -0.6; muffled or unintelligible audio comes back as invented text at -0.8 to -3.
const meanLogprob = (segments: any[]): number | null => {
  const timed = segments.filter(s => typeof s?.avg_logprob === 'number' && s.end > s.start);
  const total = timed.reduce((sum, s) => sum + (s.end - s.start), 0);
  return total > 0 ? timed.reduce((sum, s) => sum + s.avg_logprob * (s.end - s.start), 0) / total : null;
};
// Whisper's own "decoding failed" cut-off. ponytail: one global knob.
const UNCLEAR_LOGPROB = -1;

const asciiAt = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

// Identifies the audio container from its magic bytes, or null if unrecognized.
function sniffAudioExtension(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (asciiAt(bytes, 4, 4) === 'ftyp') return 'm4a';
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WAVE') return 'wav';
  if (asciiAt(bytes, 0, 4) === 'OggS') return 'ogg';
  if (asciiAt(bytes, 0, 4) === 'fLaC') return 'flac';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (asciiAt(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

interface ToneAnalysis {
  primaryEmotion: string;
  formalityLevel: string;
  audienceSuitability: string;
  deliveryStyle: string;
  // Pitch, rhythm and pauses can't be judged from a transcript, so they only
  // come from Azure's audio measurements - absent when Azure didn't run.
  measured?: Pick<PronunciationResult, 'fluency' | 'prosody' | 'monotone' | 'pauses' | 'weakSounds' | 'soundScores' | 'sections' | 'timing'> & { accent: Locale };
  // Reading exercise vs the pasted passage. Rides along here so it's saved with the report.
  readingCheck?: ReturnType<typeof compareReading>;
}

const wordTokens = (text: string): string[] => text.toLowerCase().match(/[\w']+/g) || [];

// True when the phrase's words appear consecutively in the text, ignoring
// case and punctuation (the transcript has commas the model may not repeat).
function isPhraseInText(phrase: string, text: string): boolean {
  const needle = wordTokens(phrase);
  const haystack = wordTokens(text);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

const stringArray = (value: any): string[] =>
  Array.isArray(value) ? value.filter((v: any) => typeof v === 'string' && v.trim().length > 0) : [];

function validateContextAlignment(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const status = ['aligned', 'partial', 'off-topic'].includes(raw.status) ? raw.status : null;
  if (!status || typeof raw.summary !== 'string') return null;
  const missingPoints = stringArray(raw.missingPoints);
  const consistent = consistentAlignmentStatus(status, raw.summary, missingPoints.length);
  // An on-topic badge over a "What to cover" list contradicts itself - polish lives in the issues.
  return { status: consistent, summary: raw.summary, missingPoints: consistent === 'aligned' ? [] : missingPoints };
}

const OFF_TOPIC_MAX_SCORE = 40;

// Whisper's own 25 MB upload limit, as base64.
const MAX_AUDIO_BASE64 = Math.ceil(25 * 1024 * 1024 * 4 / 3);
// 16kHz 16-bit mono PCM for the browser's 180 s cap (MAX_PCM_SECONDS), with a little slack, as base64.
const MAX_PCM_BASE64 = Math.ceil(200 * 16000 * 2 * 4 / 3);

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioBase64, speechConfig, mimeType, loudness, pcm16kBase64: pcmInput } = await req.json();
    if (typeof audioBase64 !== 'string' || !audioBase64) return jsonError('No recording was received.', 400);
    if (audioBase64.length > MAX_AUDIO_BASE64) return jsonError('This recording is too large. Please keep it under 25 MB.', 413);
    // Counted only for requests we'll actually analyse - a rejected upload shouldn't use up the day's quota.
    const limitMessage = await overLimit(req, 'analyze');
    if (limitMessage) return jsonError(limitMessage, 429);
    // The browser only sends PCM for recordings up to 3 minutes; anything bigger skips Azure.
    const pcm16kBase64 = typeof pcmInput === 'string' && pcmInput.length <= MAX_PCM_BASE64 ? pcmInput : undefined;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('🎤 Starting OpenAI speech analysis...');
    console.log('📝 Speech config:', speechConfig);

    // Step 1: Transcribe audio using Whisper
    console.log('🔊 Transcribing audio with Whisper...');
    const audioBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    const baseMime = (mimeType || 'audio/webm').split(';')[0];
    const extMap: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/x-m4a': 'm4a',
      'audio/m4a': 'm4a',
      'audio/aac': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
    };
    // The file's own header beats the declared MIME type, which browsers
    // report inconsistently. Whisper rejects M4A-branded files (iPhone voice
    // memos, Apple/ffmpeg AAC exports) when they're named .mp4, but accepts
    // every MP4/M4A audio container named .m4a.
    const ext = sniffAudioExtension(audioBuffer) ?? extMap[baseMime] ?? 'webm';
    const extMime: Record<string, string> = { m4a: 'audio/m4a', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', mp3: 'audio/mpeg' };
    const audioBlob = new Blob([audioBuffer], { type: extMime[ext] ?? baseMime });

    const whisperFormData = new FormData();
    whisperFormData.append('file', audioBlob, `audio.${ext}`);
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('response_format', 'verbose_json');
    whisperFormData.append('timestamp_granularities[]', 'word');
    whisperFormData.append('timestamp_granularities[]', 'segment'); // for no_speech_prob
    // Whisper is trained to clean up disfluencies and omits them by default -
    // without this, it silently drops "um"/"uh" for natural, real speech far
    // more often than for a clean, deliberate test recording. OpenAI's documented
    // mitigation is to bias the model with a prompt that contains the filler
    // words verbatim, so it treats them as expected vocabulary instead of noise.
    whisperFormData.append('prompt', WHISPER_PROMPT);

    const whisperResponse = await transcribeWithRetry(whisperFormData, openaiApiKey);

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('❌ Transcription API error:', whisperResponse.status, errorText);
      if (whisperResponse.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
      if (whisperResponse.status === 402) throw new Error('AI credits exhausted. Please add credits to continue.');
      throw new Error(`Transcription failed: ${errorText}`);
    }

    const whisperResult = await whisperResponse.json();
    // On silent/near-silent recordings Whisper invents text - its own prompt or
    // a stock phrase ("So it sounded like this."). Treat that as no speech so it
    // hits the insufficient-audio path instead of being analysed.
    const segments: any[] = Array.isArray(whisperResult.segments) ? whisperResult.segments : [];
    console.log('🔇 Whisper no_speech_prob per segment:', segments.map(s => s.no_speech_prob));
    // A real answer can reuse the prompt's everyday words ("this is natural"), so an echo
    // only counts as no speech when Whisper also leaned towards silence.
    const loudnessProfile = validateLoudness(loudness);
    const confidence = meanLogprob(segments);
    console.log('🎯 Whisper mean logprob:', confidence);
    const noSpeech = (echoesWhisperPrompt(whisperResult.text) && (segments.length === 0 || segments.some(s => s.no_speech_prob > 0.2) || (confidence !== null && confidence < -0.6)))
      || (segments.length > 0 && segments.every(s => s.no_speech_prob > NO_SPEECH_THRESHOLD))
      || (confidence !== null && confidence < UNCLEAR_LOGPROB)
      || wordsAreSilent(Array.isArray(whisperResult.words) ? whisperResult.words : [], loudnessProfile);
    if (noSpeech) console.log('⚠️ Whisper heard no speech, discarding transcript');
    const transcription = noSpeech ? '' : whisperResult.text;
    console.log('✅ Transcription complete:', transcription.length, 'chars');

    // Real pace/pause numbers from Whisper's word-level timestamps, not an LLM guess.
    const whisperWords: WhisperWord[] = !noSpeech && Array.isArray(whisperResult.words) ? whisperResult.words : [];
    const measuredMetrics = whisperWords.length > 0
      ? computeMetricsFromWords(whisperWords, whisperResult.duration)
      : null;
    if (measuredMetrics) {
      console.log('📏 Measured from audio - WPM:', measuredMetrics.wordsPerMinute, 'pauses:', measuredMetrics.totalPauses);
    } else {
      console.log('⚠️ No word-level timestamps returned by Whisper; falling back to estimated metrics');
    }

    // Filler words detected directly from real audio timing, not an LLM guess.
    const detectedFillers = whisperWords.length > 0 ? detectFillerWordsFromAudio(whisperWords, transcription) : null;
    if (detectedFillers) {
      console.log('🗣️ Detected filler words from audio:', detectedFillers.commonFillerWords);
    }

    const deliveryIssues = detectDeliveryIssuesFromAudio(whisperWords);
    console.log('🎚️ Delivery issues located on words:', deliveryIssues.map(d => d.type));

    // Measured pronunciation from Azure, run alongside the GPT calls below.
    // Optional: without the Azure secrets or the browser's 16kHz PCM, or if
    // Azure fails, the GPT-estimated pronunciation stays as before.
    const azureKey = Deno.env.get('AZURE_SPEECH_KEY');
    const azureRegion = Deno.env.get('AZURE_SPEECH_REGION');
    // American English only - any accent an older client sends is ignored.
    const accent: Locale = 'en-US';
    const pronunciationPromise = azureKey && azureRegion && typeof pcm16kBase64 === 'string' && whisperWords.length > 0
      ? assessPronunciation(Uint8Array.from(atob(pcm16kBase64), c => c.charCodeAt(0)), whisperWords, azureKey, azureRegion, accent)
          .catch(error => { console.error('⚠️ Azure pronunciation assessment failed:', error); return null; })
      : Promise.resolve(null);

    // Step 2: Comprehensive analysis with GPT. Grammar/vocabulary/content quality
    // run as their own focused call in parallel - folded into the one giant
    // prompt, the model consistently under-reported them (1-2 grammar issues,
    // one-line content feedback) while juggling everything else.
    console.log('🧠 Performing comprehensive analysis with GPT...');
    const analysisPrompt = createComprehensivePrompt(transcription, speechConfig, measuredMetrics, detectedFillers);
    const linguisticPrompt = createLinguisticPrompt(transcription, speechConfig, detectedFillers);

    const [gptResponse, linguisticData, emphasisData, pronunciation] = await Promise.all([
      fetch(`${OPENAI_API}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          // Lower than the API default (1.0) - this is a scoring/analysis task that
          // should be consistent for the same input, not creative. Doesn't fully
          // eliminate run-to-run variation but meaningfully reduces it.
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are an expert speech coach. Analyze speech and return ONLY valid JSON with no markdown formatting.',
            },
            {
              role: 'user',
              content: analysisPrompt,
            },
          ],
        }),
      }),
      requestLinguisticAnalysis(linguisticPrompt, openaiApiKey),
      requestLinguisticAnalysis(createEmphasisPrompt(transcription), openaiApiKey),
      pronunciationPromise,
    ]);

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      console.error('❌ Analysis error:', gptResponse.status, errorText);
      if (gptResponse.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
      if (gptResponse.status === 402) throw new Error('AI credits exhausted. Please add credits to continue.');
      throw new Error(`Analysis failed: ${errorText}`);
    }

    const gptResult = await gptResponse.json();
    let analysisData;

    try {
      const content = gptResult.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : content;
      analysisData = JSON.parse(jsonString);
    } catch (parseError) {
      // Placeholder 60s would be saved and shown as a real report - fail instead so the user retries.
      console.error('❌ Failed to parse GPT response:', parseError);
      throw new Error("Analysis couldn't be completed - please try again.");
    }
    if (!analysisData || typeof analysisData !== 'object') throw new Error("Analysis couldn't be completed - please try again.");
    // Keep only well-formed feedback rows; a malformed one would show NaN or crash a card.
    const validFeedback = Array.isArray(analysisData.feedback)
      ? analysisData.feedback.filter((f: any) => typeof f?.category === 'string' && typeof f?.score === 'number' && isFinite(f.score))
        // The model's own colour is a guess; the score decides it unless a measurement overrides it below.
        .map((f: any) => ({ ...f, color: f.score >= 80 ? 'green' : f.score >= 60 ? 'yellow' : 'red' }))
      : [];
    analysisData.feedback = validFeedback.length > 0 ? validFeedback : createDefaultFeedback();

    if (linguisticData) {
      await topUpLinguisticAnalysis(linguisticPrompt, linguisticData, transcription, speechConfig?.purposeKey === 'reading-exercise', openaiApiKey);
      analysisData = {
        ...analysisData,
        grammarAnalysis: linguisticData.grammarAnalysis,
        vocabularyAnalysis: linguisticData.vocabularyAnalysis,
        contentQualityAnalysis: linguisticData.contentQualityAnalysis,
      };
    } else {
      // Empty sections would read as "no mistakes found"; flag them so the cards say the check didn't run.
      console.warn('⚠️ Linguistic analysis unavailable; grammar/vocabulary/content marked unavailable');
      analysisData = {
        ...analysisData,
        grammarAnalysis: { issues: [], tips: [] },
        vocabularyAnalysis: { strengths: [], weaknesses: [], tips: [] },
        contentQualityAnalysis: { issues: [], tips: [] },
        feedback: analysisData.feedback.map((f: any) => /grammar/i.test(f.category)
          ? { ...f, feedback: "The detailed grammar check couldn't run for this recording - this score is an estimate. Try analysing again for a full check." }
          : f),
      };
    }
    analysisData = { ...analysisData, emphasisSuggestions: emphasisData?.emphasisSuggestions };

    // Swap the generic default filler alternatives for ones that fit each
    // filler's actual sentence, when the model provided them.
    if (detectedFillers && Array.isArray(linguisticData?.fillerAlternatives)) {
      for (const entry of linguisticData.fillerAlternatives) {
        const mistake = detectedFillers.mistakes[entry?.index];
        // "um"/"uh" are hesitation sounds with no meaning to replace - a pause is the only fix,
        // and formal connectors ("consequently") change what the sentence says.
        if (!mistake || isHesitation(mistake.text)) continue;
        const alternatives = Array.isArray(entry?.alternatives)
          // Short connectors only - the model sometimes returns rewritten sentences or formal connectors.
          ? entry.alternatives.filter((a: any) => typeof a === 'string' && a.trim().length > 0 && countWords(a) <= MAX_FILLER_ALTERNATIVE_WORDS && !FORMAL_CONNECTORS.test(a.trim())).slice(0, 3)
          : [];
        if (mistake && alternatives.length > 0) {
          mistake.alternatives = alternatives;
          mistake.suggestion = buildFillerSuggestion(mistake.text, alternatives);
        }
      }
    }

    // The model reliably produces polished, high, self-contradictory scores for
    // near-silent/too-short audio despite being told not to - override deterministically.
    const realWordCount = measuredMetrics?.totalWords ?? transcription.trim().split(/\s+/).filter(Boolean).length;
    if (realWordCount < MIN_WORDS_FOR_ANALYSIS) {
      console.log('⚠️ Not enough real speech detected, overriding analysis with insufficient-audio result');
      const insufficientAudio = createInsufficientAudioAnalysis(speechConfig?.purposeKey === 'reading-exercise');
      analysisData = {
        ...analysisData,
        overallScore: insufficientAudio.overallScore,
        overallScoreRationale: insufficientAudio.overallScoreRationale,
        speechMetrics: { ...analysisData.speechMetrics, pronunciationAccuracy: insufficientAudio.pronunciationAccuracy },
        toneAnalysis: insufficientAudio.toneAnalysis,
        toneSuggestions: insufficientAudio.toneSuggestions,
        mispronuncedWords: insufficientAudio.mispronuncedWords,
        feedback: insufficientAudio.feedback,
        categoryScores: insufficientAudio.categoryScores,
        grammarAnalysis: insufficientAudio.grammarAnalysis,
        vocabularyAnalysis: insufficientAudio.vocabularyAnalysis,
        contentQualityAnalysis: insufficientAudio.contentQualityAnalysis,
        emphasisSuggestions: insufficientAudio.emphasisSuggestions,
      };
    } else if (pronunciation) {
      // Replace the LLM's text-based pronunciation guesses with Azure's measurements.
      console.log('🗣️ Azure pronunciation - accuracy:', pronunciation.accuracy, 'fluency:', pronunciation.fluency, 'prosody:', pronunciation.prosody);
      const colorOf = (score: number) => (score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red');
      const tone = analysisData.toneAnalysis || createDefaultToneAnalysis();
      // A transcript can't show vocal expression - the GPT-guessed delivery score
      // and style give way to Azure's measured prosody and pitch.
      const { prosody, monotone, fluency, pauses } = pronunciation;
      const unexpected = pauses.filter(p => p.kind !== 'missing').length;
      const missing = pauses.length - unexpected;
      const pauseNote = [
        unexpected ? `${unexpected} pause${unexpected > 1 ? 's' : ''} broke up a phrase` : '',
        missing ? `${missing} place${missing > 1 ? 's' : ''} needed a pause you ran through` : '',
      ].filter(Boolean).join(' and ');
      const deliveryVerdict = prosody === null ? null
        : `${monotone ? 'Your pitch stayed mostly flat - vary it to keep listeners engaged' : prosody >= 80 ? 'Natural rhythm and intonation' : prosody >= 60 ? 'Rhythm and intonation are mostly natural, with some flat or choppy stretches' : 'Your rhythm and intonation sound flat or choppy'} - measured ${prosody}/100 from your audio.`
          + (pauseNote ? ` ${pauseNote[0].toUpperCase()}${pauseNote.slice(1)} - see Pace & Pausing.`
            : !monotone && prosody < 100 ? ' To reach 100: stress the key word in each sentence and let your pitch fall at the end of statements.' : '');
      // Monotone delivery can't be green however Azure scored the rest of the prosody.
      const deliveryColor = prosody === null ? null : monotone && prosody >= 80 ? 'yellow' : colorOf(prosody);
      // Azure fluency measures hesitation directly; the model only guesses it from text.
      const deliveryStyle = monotone ? 'monotone'
        : fluency !== null && fluency < 60 ? 'hesitant'
        : fluency !== null && fluency >= 80 && tone.deliveryStyle === 'hesitant' ? 'confident'
        // Measured flat/choppy delivery isn't "confident" or "energetic", whatever the words suggest.
        : prosody !== null && prosody < 60 && ['confident', 'energetic'].includes(tone.deliveryStyle) ? 'hesitant'
        : tone.deliveryStyle;
      analysisData = {
        ...analysisData,
        speechMetrics: { ...analysisData.speechMetrics, pronunciationAccuracy: pronunciation.accuracy },
        mispronuncedWords: pronunciation.mispronouncedWords,
        toneAnalysis: {
          ...tone,
          deliveryStyle,
          measured: { fluency, prosody, monotone, pauses, accent, weakSounds: pronunciation.weakSounds, soundScores: pronunciation.soundScores, sections: pronunciation.sections, timing: pronunciation.timing },
        },
        feedback: (analysisData.feedback || createDefaultFeedback()).map((f: any) =>
          /pronunciation|clarity/i.test(f?.category || '')
            ? { ...f, score: pronunciation.accuracy, feedback: pronunciation.summary, color: colorOf(pronunciation.accuracy) }
            : deliveryVerdict !== null && /emotional|delivery/i.test(f?.category || '')
              ? { ...f, score: prosody, feedback: deliveryVerdict, color: deliveryColor }
              : f
        ),
        categoryScores: Array.isArray(analysisData.categoryScores)
          ? analysisData.categoryScores.map((c: any) =>
              c?.name === 'Clarity' ? { ...c, value: pronunciation.accuracy }
              : c?.name === 'Emotion' && prosody !== null ? { ...c, value: prosody }
              : c)
          : analysisData.categoryScores,
      };
    } else {
      // Azure didn't run, so these two scores are the model's guess from text, which can't
      // hear the audio (it gave 100 "no errors detected"). Say so rather than pass them off as measured.
      console.warn('⚠️ Pronunciation not measured -', !azureKey || !azureRegion ? 'Azure not configured' : typeof pcm16kBase64 !== 'string' ? 'no 16kHz audio from the browser' : 'Azure failed (see error above)');
      analysisData = {
        ...analysisData,
        feedback: analysisData.feedback.map((f: any) =>
          /pronunciation|clarity/i.test(f?.category || '')
            ? { ...f, feedback: `Estimated - we couldn't measure your pronunciation from the audio this time. ${f.feedback}` }
            : /emotional|delivery/i.test(f?.category || '')
              ? { ...f, feedback: `Estimated - we couldn't measure your vocal delivery from the audio this time. ${f.feedback}` }
              : f),
      };
    }

    // The model rounds pace to the same few numbers (70 for anything "a bit fast");
    // the measured WPM gives the real score.
    if (measuredMetrics && realWordCount >= MIN_WORDS_FOR_ANALYSIS) {
      const wpm = measuredMetrics.wordsPerMinute;
      const pace = paceScoreFor(wpm);
      // Written from the same WPM as the score - the model's text said "a bit fast" next to a 100.
      const paceText = wpm > IDEAL_WPM.max
        ? `You spoke at ${wpm} WPM, faster than the comfortable ${IDEAL_WPM.min}-${IDEAL_WPM.max} range - slow down and pause between ideas to reach 100.`
        : wpm < IDEAL_WPM.min
        ? `You spoke at ${wpm} WPM, slower than the comfortable ${IDEAL_WPM.min}-${IDEAL_WPM.max} range - keep sentences moving and shorten long gaps to reach 100.`
        : `You spoke at ${wpm} WPM, inside the comfortable ${IDEAL_WPM.min}-${IDEAL_WPM.max} range.`;
      analysisData = {
        ...analysisData,
        feedback: (analysisData.feedback || createDefaultFeedback()).map((f: any) =>
          /pace/i.test(f?.category || '') ? { ...f, score: pace, feedback: paceText, color: pace >= 80 ? 'green' : pace >= 60 ? 'yellow' : 'red' } : f),
        categoryScores: Array.isArray(analysisData.categoryScores)
          ? analysisData.categoryScores.map((c: any) => (c?.name === 'Pace' ? { ...c, value: pace } : c))
          : analysisData.categoryScores,
      };
    }

    // Filler score from the measured filler rate, not the model's count of what it thinks it heard.
    if (detectedFillers && realWordCount >= MIN_WORDS_FOR_ANALYSIS) {
      const count = detectedFillers.mistakes.length;
      const percent = Math.round((count / realWordCount) * 100);
      const filler = fillerScoreFor(count, realWordCount);
      const fillerText = count === 0
        ? 'No filler words (um, uh, you know) detected.'
        : `${count} filler word${count > 1 ? 's' : ''} (${percent}% of your words)${filler < 100 ? ' - replace each with a short silent pause to reach 100' : ''}.`;
      analysisData = {
        ...analysisData,
        feedback: analysisData.feedback.map((f: any) =>
          /filler/i.test(f?.category || '') ? { ...f, score: filler, feedback: fillerText, color: filler >= 80 ? 'green' : filler >= 60 ? 'yellow' : 'red' } : f),
      };
    }

    // Validated once here: the Grammar card lists these, and the Grammar score is counted from them.
    // Also filters out "vague"/word-choice-labeled entries - the prompt says not to put these
    // here, but it's proven unreliable at following that, so this is enforced regardless.
    // A one-word "correction" of a word Azure heard differently ("laid" -> "lay") is the
    // transcriber mishearing it, not the speaker's mistake.
    // ponytail: only catches words Azure scored low enough to list as mispronounced.
    const misheard = new Set((pronunciation?.mispronouncedWords || []).map(w => spokenWords(w.word)));
    const isMisheard = (original: string, corrected: string) => {
      const { removed, added } = changedWords(original, corrected);
      return removed.length === 1 && added.length === 1 && misheard.has(removed[0]);
    };
    const grammarIssues = Array.isArray(analysisData.grammarAnalysis?.issues)
      ? analysisData.grammarAnalysis.issues
          .filter((i: any) =>
            typeof i?.original === 'string' &&
            typeof i?.corrected === 'string' &&
            // Same spoken words = only punctuation/hyphens/case changed, which can't be heard.
            spokenWords(i.original) !== spokenWords(i.corrected) &&
            !/vague|word choice|vocabulary/i.test(i?.errorType || '') &&
            !NOT_SPOKEN_GRAMMAR.test(i?.errorType || '') &&
            !isWrittenOnlyIssue(i?.errorType, i?.explanation) &&
            classifyGrammarFix(i.original, i.corrected) !== 'drop' &&
            !isCourtesy(i.original) &&
            !isMisheard(i.original, i.corrected) &&
            // Every quoted mistake must be something the speaker said, or it can't be highlighted.
            isPhraseInText(i.original, transcription)
          )
          // Hyphens can't be spoken, so don't show the speaker one in a fix ("inference-related").
          .map((i: any) => ({
            ...i,
            corrected: i.corrected.replace(/(\w)-(\w)/g, '$1 $2'),
            kind: i.kind === 'refinement' || classifyGrammarFix(i.original, i.corrected) === 'optional' ? 'refinement' : 'error',
          }))
          // Real errors first, polish suggestions after.
          .sort((a: any, b: any) => (a.kind === b.kind ? 0 : a.kind === 'error' ? -1 : 1))
      : [];

    // The model's Grammar score ignored how many mistakes the Grammar card shows (80 with 2 errors
    // in 3 sentences); score it as the share of sentences without an error instead.
    if (linguisticData && realWordCount >= MIN_WORDS_FOR_ANALYSIS) {
      const { score: grammar, text } = grammarVerdict(grammarIssues, String(transcription));
      analysisData = {
        ...analysisData,
        feedback: (analysisData.feedback || createDefaultFeedback()).map((f: any) =>
          /grammar/i.test(f?.category || '') ? { ...f, score: grammar, feedback: text, color: grammar >= 80 ? 'green' : grammar >= 60 ? 'yellow' : 'red' } : f),
      };
    }

    if (speechConfig?.purposeKey === 'reading-exercise' && typeof speechConfig.readingPassage === 'string' && realWordCount >= MIN_WORDS_FOR_ANALYSIS) {
      const readingCheck = compareReading(speechConfig.readingPassage, transcription);
      if (readingCheck) analysisData = { ...analysisData, toneAnalysis: { ...(analysisData.toneAnalysis || createDefaultToneAnalysis()), readingCheck } };
    }

    console.log('✅ Analysis complete');

    // Step 3: Generate improved speech
    console.log('✨ Generating improved speech version...');
    const improvedSpeech = await generateImprovedSpeech(
      transcription,
      openaiApiKey,
      speechConfig,
      analysisData
    );

    console.log('🎙️ Improved speech generated');

    // Step 4: Generate TTS audio for improved speech
    let improvedAudioUrl;
    try {
      console.log('🔊 Generating TTS audio for improved speech...');
      const ttsResult = await generateTTSAudio(improvedSpeech.clean, openaiApiKey, { markup: improvedSpeech.annotated, key: azureKey, region: azureRegion, locale: accent });
      improvedAudioUrl = ttsResult.audioUrl;
      console.log('✅ TTS audio for improved speech generated');
    } catch (ttsError) {
      console.error('⚠️ TTS generation for improved speech failed:', ttsError);
      improvedAudioUrl = undefined;
    }

    // Return comprehensive response
    const finalFeedback = analysisData.feedback || createDefaultFeedback();
    // Weighted average of the final scores, with the model judging only how much each area
    // matters for this speech's purpose. Its own overallScore ignored the sub-scores (85 for
    // 100/100/77/100/100) because it was made before Azure/WPM replaced them.
    const structure = Array.isArray(analysisData.categoryScores)
      ? analysisData.categoryScores.find((c: any) => c?.name === 'Structure' && typeof c.value === 'number')?.value
      : undefined;
    const scored: [string, number][] = [...finalFeedback.map((f: any) => [f.category, f.score]), ['Structure', structure]]
      .filter(([, score]: any) => typeof score === 'number') as [string, number][];
    const scores = scored.map(([, score]) => score);
    const weightOf = (category: string) => {
      const w = analysisData.scoreWeights?.[category];
      return typeof w === 'number' && w >= 1 && w <= 3 ? w : 1;
    };
    const totalWeight = scored.reduce((sum, [category]) => sum + weightOf(category), 0);
    const alignment = validateContextAlignment(analysisData.contentQualityAnalysis?.contextAlignment);
    const weighted = scored.length === 0 ? 60
      : Math.round(scored.reduce((sum, [category, score]) => sum + score * weightOf(category), 0) / totalWeight);
    // A fluent speech about the wrong topic didn't do the task - Structure 0 alone barely moves the
    // average (an off-topic pasta speech scored 81), so cap it.
    const overallScore = alignment?.status === 'off-topic' ? Math.min(weighted, OFF_TOPIC_MAX_SCORE) : weighted;
    const modelRationale = typeof analysisData.overallScoreRationale === 'string' ? analysisData.overallScoreRationale : '';
    const overallScoreRationale = measuredMetrics && scores.length > 0 && realWordCount >= MIN_WORDS_FOR_ANALYSIS
      // Off-topic is the main reason for a low score - the per-area summary alone would hide it.
      ? (alignment && alignment.status !== 'aligned' ? `${alignment.summary} ` : '')
        + rationaleFor([...finalFeedback, ...(typeof structure === 'number' ? [{ category: 'Structure', score: structure }] : [])])
      : modelRationale;

    const unavailable = !linguisticData && realWordCount >= MIN_WORDS_FOR_ANALYSIS ? { unavailable: true } : {};
    const response = {
      // What this report was made for, so the history view shows the same context.
      speechConfig: {
        purposeKey: speechConfig?.purposeKey,
        purpose: speechConfig?.purpose,
        practicePrompt: speechConfig?.practicePrompt,
        topic: speechConfig?.topic,
        accent,
      },
      transcription,
      improvedTranscription: improvedSpeech.annotated,
      improvedTranscriptionClean: improvedSpeech.clean,
      improvedAudioUrl,
      overallScore,
      overallScoreRationale,
      speechMetrics: {
        ...buildFinalMetrics(transcription, measuredMetrics, analysisData.speechMetrics, detectedFillers?.mistakes.length, realWordCount >= MIN_WORDS_FOR_ANALYSIS),
        measured: measuredMetrics !== null,
      },
      toneAnalysis: analysisData.toneAnalysis || createDefaultToneAnalysis(),
      toneSuggestions: {
        // A reading exercise reads someone else's words - rewording them isn't feedback.
        phrases: Array.isArray(analysisData.toneSuggestions?.phrases) && speechConfig?.purposeKey !== 'reading-exercise'
          ? analysisData.toneSuggestions.phrases
              .filter((p: any) => typeof p?.original === 'string' && typeof p?.rewritten === 'string' && isPhraseInText(p.original, transcription) && keepsSpeakersWords(p.original, p.rewritten))
              .map((p: any) => ({ ...p, rewritten: withoutInventedStats(p.rewritten, transcription) }))
          : [],
        tips: stringArray(analysisData.toneSuggestions?.tips),
      },
      // The model doesn't always follow the "return an empty array" instruction, and can
      // return malformed entries (missing text/type) even when it does try to comply, so
      // validate its output regardless. When we have real detected fillers, ignore the
      // model's "mistakes" entirely rather than merge - "mistakes" is only ever meant to
      // carry filler words here, and the model output has proven unreliable for them.
      mispronuncedWords: (analysisData.mispronuncedWords || []).filter(
        (w: any) => typeof w?.word === 'string' && w.word.length > 0
      ),
      mistakes: detectedFillers
        ? [...detectedFillers.mistakes, ...(realWordCount >= MIN_WORDS_FOR_ANALYSIS ? deliveryIssues : [])]
        : (analysisData.mistakes || []).filter(
            (m: any) => typeof m?.text === 'string' && m.text.length > 0 && typeof m?.type === 'string'
          ),
      feedback: finalFeedback,
      analytics: {
        categoryScores: analysisData.categoryScores || createDefaultCategoryScores(speechConfig?.purposeKey === 'reading-exercise'),
        commonFillerWords: detectedFillers ? detectedFillers.commonFillerWords : (analysisData.commonFillerWords || []),
      },
      // Defensively validated like mispronuncedWords/mistakes above - the model
      // doesn't always follow the requested shape, and malformed entries here
      // would otherwise crash the frontend the same way the old "mistakes" bug did.
      grammarAnalysis: {
        issues: grammarIssues,
        // Tips are tied to the issues found - none left means nothing to advise on.
        // Rules of thumb ("Always use articles") only back real errors - over optional polish they contradict it.
        tips: grammarIssues.some((i: any) => i.kind === 'error') ? stringArray(analysisData.grammarAnalysis?.tips).filter(t => !NOT_GRAMMAR_TIP.test(t)) : [],
        ...unavailable,
      },
      vocabularyAnalysis: {
        strengths: Array.isArray(analysisData.vocabularyAnalysis?.strengths)
          ? analysisData.vocabularyAnalysis.strengths.filter((s: any) => typeof s?.word === 'string')
          : [],
        weaknesses: Array.isArray(analysisData.vocabularyAnalysis?.weaknesses)
          ? analysisData.vocabularyAnalysis.weaknesses
              .filter((w: any) => typeof w?.word === 'string' && isPhraseInText(w.word, transcription) && !isCourtesy(w.word) && !isFillerOnly(spokenWords(w.word).split(' ')) && !isWrittenOnlyIssue(undefined, w.suggestion))
              .map((w: any) => ({
                word: w.word,
                alternatives: stringArray(w.alternatives),
                betterPhrase: typeof w.betterPhrase === 'string' ? w.betterPhrase : undefined,
                idiom: typeof w.idiom === 'string' && w.idiom.trim() ? w.idiom : undefined,
                suggestion: typeof w.suggestion === 'string' ? w.suggestion : '',
              }))
              .filter((w: any) => w.alternatives.length > 0 || w.betterPhrase || w.idiom || w.suggestion)
          : [],
        tips: stringArray(analysisData.vocabularyAnalysis?.tips),
        ...unavailable,
      },
      contentQualityAnalysis: {
        contextAlignment: alignment,
        // excerpt is optional - an off-topic or missing-point issue may have
        // nothing in the transcript to quote.
        issues: Array.isArray(analysisData.contentQualityAnalysis?.issues)
          ? analysisData.contentQualityAnalysis.issues
              .filter((i: any) => typeof i?.suggestion === 'string' && i.suggestion.trim().length > 0 &&
                courtesyContentIssue(String(i.type), String(i.excerpt ?? '')) !== 'drop')
              .map((i: any) => ({
                // An "Off topic" item under a "Partially"/"On topic" badge contradicts it - it's a gap to fill.
                type: typeof i.type !== 'string' ? 'suggestion' : i.type === 'off-topic' && alignment?.status !== 'off-topic' ? 'missing-detail' : i.type,
                excerpt: typeof i.excerpt === 'string' && isPhraseInText(i.excerpt, transcription) && courtesyContentIssue(String(i.type), i.excerpt) === 'keep' ? i.excerpt : '',
                problem: typeof i.problem === 'string' ? i.problem : '',
                suggestion: withoutInventedStats(i.suggestion, transcription),
                example: typeof i.example === 'string' ? withoutInventedStats(i.example, transcription) : '',
              }))
          : [],
        tips: stringArray(analysisData.contentQualityAnalysis?.tips).map(t => withoutInventedStats(t, transcription)),
        ...unavailable,
      },
      emphasisSuggestions: {
        // Only phrases the speaker actually said - the model has invented
        // on-topic phrases for off-topic speeches, which can't be emphasized.
        phrases: Array.isArray(analysisData.emphasisSuggestions?.phrases)
          ? analysisData.emphasisSuggestions.phrases.filter((p: any) => typeof p?.phrase === 'string' && isPhraseInText(p.phrase, transcription))
          : [],
        tips: stringArray(analysisData.emphasisSuggestions?.tips),
      },
    };

    console.log('✅ Complete response ready');

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error in analyze-speech-openai:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        transcription: 'Error occurred during analysis'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Shared by every prompt that needs to judge the speech against what the
// speaker was supposed to talk about - the topic, the free-text context from
// Speech Configuration, and (in practice mode) the exact question/prompt.
function buildSpeechContext(speechConfig?: any): string {
  // A config without a purpose has no context to describe.
  if (!speechConfig?.purpose && !speechConfig?.topic && !speechConfig?.title && !speechConfig?.practicePrompt && !speechConfig?.additionalContext) return '';
  const topic = speechConfig.topic || speechConfig.title;
  return `
Speech Context:
${topic ? `- Topic: ${topic}\n` : ''}- Purpose: ${speechConfig.purpose || 'General speaking'}
- Audience: ${speechConfig.audience || 'General audience'}
- Tone: ${speechConfig.tone || 'Not specified'}
- Duration target: ${speechConfig.duration || 'Not specified'}
${speechConfig.additionalContext ? `- Additional context from speaker (what this speech is supposed to be about): ${speechConfig.additionalContext}\n` : ''}${speechConfig.practicePrompt ? `- Practice question/prompt the speaker was responding to: ${speechConfig.practicePrompt}\n` : ''}`;
}

const hasContentExpectations = (speechConfig?: any): boolean =>
  !!(speechConfig?.topic || speechConfig?.title || speechConfig?.additionalContext || speechConfig?.practicePrompt);

function createComprehensivePrompt(
  transcription: string,
  speechConfig?: any,
  measuredMetrics?: ReturnType<typeof computeMetricsFromWords> | null,
  detectedFillers?: ReturnType<typeof detectFillerWordsFromAudio> | null
): string {
  const isReadingExercise = speechConfig?.purposeKey === 'reading-exercise';

  const measuredContext = measuredMetrics
    ? `
MEASURED FROM THE ACTUAL AUDIO (ground truth — do not invent different numbers, and write your Speaking Pace feedback and tips using these real figures):
- Actual speaking pace: ${measuredMetrics.wordsPerMinute} words per minute
- Pace by section: ${measuredMetrics.sectionPace.map(s => `${s.label} ${s.wordsPerMinute} WPM`).join(', ') || 'not enough words to break into sections'}
- Real pauses detected (>= ${PAUSE_THRESHOLD_SECONDS}s of silence): ${measuredMetrics.totalPauses}${measuredMetrics.pauseTimestamps.length > 0 ? ` at ${measuredMetrics.pauseTimestamps.map(p => `${p.timestamp} (${p.durationSeconds}s)`).join(', ')}` : ''}
When writing the "Speaking Pace" feedback item, call out which section (Opening/Middle/Closing) was too fast or too slow using the numbers above, not a generic guess. If you reference more than one section in the same sentence (e.g. "middle and closing"), each section has its own WPM value from the list above - state each section's actual number, never apply one section's number to another.
`
    : '';

  const fillerContext = detectedFillers
    ? `
REAL FILLER WORDS DETECTED FROM AUDIO TIMING (ground truth — do not detect or count filler words yourself, do not invent different ones): ${
        detectedFillers.commonFillerWords.length > 0
          ? detectedFillers.commonFillerWords.map(f => `"${f.word}" x${f.count}`).join(', ')
          : 'none detected'
      }
Base your "Filler Words" feedback score and text on this real count, not your own reading of the transcript.
`
    : '';

  const configContext = buildSpeechContext(speechConfig);

  const categoryScoresSchema = isReadingExercise
    ? `{ "name": "Clarity", "value": <integer 0-100> },
    { "name": "Pace", "value": <integer 0-100> },
    { "name": "Emotion", "value": <integer 0-100> }`
    : `{ "name": "Clarity", "value": <integer 0-100> },
    { "name": "Pace", "value": <integer 0-100> },
    { "name": "Emotion", "value": <integer 0-100> },
    { "name": "Structure", "value": <integer 0-100> }`;

  const contentGuidance = isReadingExercise
    ? `\nIMPORTANT: This is a READING EXERCISE — the speaker is reading someone else's text aloud, not composing their own content. Do NOT evaluate or score content quality, structure, coherence, or organization of ideas (there is no "Structure" category and no content-related feedback item). Focus exclusively on delivery: pronunciation, pace, filler words, tone, grammar accuracy while reading, and emphasis.`
    : hasContentExpectations(speechConfig)
      ? `\nIMPORTANT: The Speech Context above says what this speech is supposed to be about. If the speech does not actually address that topic/context/question (or only partly does), that MUST lower the "Structure" category score and overallScore, and overallScoreRationale must say so - a fluent speech about the wrong thing is not a good speech for this purpose.`
      : '';

  return `${configContext}${contentGuidance}${measuredContext}${fillerContext}

Analyze this speech transcription comprehensively:

"${transcription}"

CRITICAL - grounding your answer in THIS transcription:
- Every score, word, timestamp, and count below MUST be derived from the actual transcription above. The JSON structure below uses <placeholder> markers to show the expected shape and type only — they are not sample content and must never appear in your answer or influence your numbers.
- If the transcription is empty, near-silent, just noise, or too short/repetitive to say anything meaningful (e.g. a couple of repeated words), do not invent a polished analysis. Reflect that honestly: low pronunciationAccuracy, empty mispronuncedWords/mistakes/commonFillerWords arrays, and feedback that says the recording didn't contain enough speech to assess, with correspondingly low scores.
- Do not fabricate mispronounced words, filler words, or mistakes that are not actually present in the transcription text.

Return a JSON object with this EXACT structure (no markdown, just JSON):

{
  // How much each area matters for THIS speech's purpose/context: 3 = matters most, 1 = least
  // (e.g. for a job interview, Grammar and Structure may matter more than raw pace; for a casual
  // presentation, Emotional Delivery may matter more). The overall score is computed from these
  // weights and the final category scores.
  "scoreWeights": { "Pronunciation Clarity": <1-3>, "Speaking Pace": <1-3>, "Emotional Delivery": <1-3>, "Filler Words": <1-3>, "Grammar": <1-3>${isReadingExercise ? '' : ', "Structure": <1-3>'} },
  "overallScoreRationale": "<one sentence on what most influenced your weighting for this speech>",
  "speechMetrics": {
    "pronunciationAccuracy": <integer 0-100, based on actual errors found in the transcription>,
    "fillerWordPercentage": 0 // always 0 here - the real value is computed from audio timing and replaces this
  },
  "toneAnalysis": {
    "primaryEmotion": "<the emotion you actually detect>",
    // Describe how THIS speech actually sounds from its words - not the tone the speaker chose in the setup.
    "formalityLevel": "formal|neutral|casual",
    "audienceSuitability": "professional|general|informal",
    "deliveryStyle": "confident|hesitant|energetic"
  },
  "toneSuggestions": {
    "phrases": [
      // 2-3 specific phrases from THIS transcription where the tone could land better for this purpose/audience. Even if the tone is already reasonable, still suggest how to make the strongest moments warmer/more assertive/more engaging - only return an empty array if the speech is a handful of words:
      {
        "original": "<the exact phrase/sentence as transcribed>",
        "suggestedTone": "<the tone that would work better here, e.g. 'warmer', 'more assertive', 'more enthusiastic'>",
        "rewritten": "<the same phrase, rewritten to demonstrate that tone - keep the speaker's own ideas, claims and key words; change only delivery/phrasing intensity, never add new points, facts, numbers or vocabulary>",
        "reason": "<why this moment specifically calls for that tone, given the purpose/audience>"
      }
    ],
    "tips": [] // 1-2 short tips on DELIVERING this speech in the right tone for its audience/purpose (tone of voice, emphasis, pacing, pauses) - not rewrites of its content
  },
  "mispronuncedWords": [
    // one entry per word actually mispronounced in the transcription, in this shape - omit entirely (empty array) if none:
    {
      "word": "<the word as transcribed>",
      "correctWord": "<the correct word>",
      "confidence": <0-1>,
      "phoneticCorrect": "<correct phonetic pronunciation>",
      "phoneticPronounced": "<how it was actually pronounced>",
      "suggestion": "<specific correction advice for this word>"
    }
  ],
  "mistakes": [],
  // Leave "mistakes" as an empty array - filler-word entries are added automatically
  // from real audio timing after your response, so do not populate this yourself.
  "feedback": [
    // exactly these 5 categories, each with a score and feedback text you determine from THIS transcription - do not reuse these example scores/text.
    // Unless a score is 100, its feedback MUST end with one concrete step to reach 100, quoting the exact words from THIS transcription it applies to - a high score still has room to improve:
    { "category": "Pronunciation Clarity", "score": <integer 0-100>, "feedback": "<specific to this recording>", "color": "green|yellow|red" },
    { "category": "Speaking Pace", "score": <integer 0-100>, "feedback": "<specific to this recording>", "color": "green|yellow|red" },
    { "category": "Emotional Delivery", "score": <integer 0-100>, "feedback": "<specific to this recording, about HOW it was delivered (tone, emphasis, pacing, energy) - never a rewrite of what was said>", "color": "green|yellow|red" },
    { "category": "Filler Words", "score": <integer 0-100>, "feedback": "<specific to this recording>", "color": "green|yellow|red" },
    { "category": "Grammar", "score": <integer 0-100>, "feedback": "<specific to this recording>", "color": "green|yellow|red" }
  ],
  "categoryScores": [
    ${categoryScoresSchema}
  ],
  // Leave "commonFillerWords" as an empty array - it is computed from real audio
  // timing after your response, so do not populate this yourself.
  "commonFillerWords": []
}

CRITICAL - Pronunciation Mistake Detection:
Carefully analyze the transcription for pronunciation mistakes including:

A. CASUAL/INFORMAL PRONUNCIATION:
- Casual pronunciation: "da" for "the", "gonna" for "going to", "wanna" for "want to"
- Dropped letters: "runnin'" for "running", "somethin'" for "something", "everythin'" for "everything"
- Incorrect word substitutions: "deer" for "their", "wackin'" for "waking"
- Slang or mispronunciations: "kinda" for "kind of", "lil'" for "little"

B. COMMON NON-NATIVE PRONUNCIATION PATTERNS (L1 Influence):

1. Vowel Shortening/Distortion - non-native speakers often collapse vowel distinctions:
   - "ship" / "sheep" - both sounding like "ship" (correct: "ship" = "ship", "sheep" = "sheep" with long ee)
   - "full" / "fool" - both becoming "ful" (correct: "full" = "full", "fool" = "fool" with long oo)
   - "bet" / "bat" - both sounding like "bat" (correct: "bet" = "bet" with short e, "bat" = "bat" with short a)
   - "pen" / "pan" - vowel collapse
   - "sit" / "seat" - short/long vowel confusion

2. TH Sound → T or D Substitution (most common error):
   - "think" → "tink" (correct: "think" with tongue between teeth)
   - "this" → "dis" (correct: "this" with voiced th)
   - "then" → "den" (correct: "then" with voiced th)
   - "three" → "tree" (correct: "three" with th sound)
   - "brother" → "broder" (correct: "bruh-ther" with soft th)
   - "nothing" → "noting" (correct: "nuh-thing" with th)

3. R and L Purity Issues:
   - "world" → "vurld" or "warld" (correct: "wurld" with rounded w and clear r)
   - "girl" → "gull" (correct: "gurl" with r sound)
   - "really" → "reaaaly" with extra vowel (correct: "ree-lee" - two syllables only)
   - "problem" → "probelem" (correct: "prob-lem")
   - "feel" → "fill" (correct: "feel" with long ee)

4. Consonant Cluster Vowel Insertion (schwa insertion):
   - "school" → "iss-chool" or "is-kool" (correct: "skool" - no extra vowel)
   - "sprite" → "is-prite" (correct: "sprite" - blend sp together)
   - "strange" → "is-trange" (correct: "strange" - blend str)
   - "street" → "is-treet" (correct: "street" - blend str)
   - "scream" → "is-cream" (correct: "skream" - blend sc)

5. Ending Sound Drops (final consonant deletion):
   - "best" → "bes" (correct: "best" with hard t at end)
   - "cold" → "cole" or "col" (correct: "cold" with d sound)
   - "hand" → "han" (correct: "hand" with d at end)
   - "task" → "tas" (correct: "task" with k sound)
   - "find" → "fine" (correct: "find" with d)

For EACH pronunciation mistake found, provide:
- The exact word as spoken (from transcription)
- The correct word that should have been said
- English/Latin phonetic spelling for BOTH the incorrect and correct pronunciations (NOT IPA symbols)
- A specific improvement tip (e.g., for TH sounds: "Place tongue between teeth and blow air")

PHONETIC SPELLING EXAMPLES (use simple readable phonetics like these):
- "the" → correct: "thuh" or "thee" (NOT /ðə/)
- "think" → if said as "tink": incorrect phonetic "tink", correct: "think" with tongue between teeth
- "gonna" → "gon-uh" (NOT /ˈɡɑnə/)
- "school" → if said as "iss-chool": incorrect "iss-kool", correct: "skool" (no gap)
- "world" → if said as "vurld": incorrect "vurld", correct: "wurld"
- "best" → if said as "bes": incorrect "bes", correct: "best" with t

Make phonetics readable for non-linguists - spell out sounds as they would be pronounced in English.

CRITICAL SCORING GUIDELINES - Use the FULL 0-100 range accurately:

For PRONUNCIATION CLARITY specifically:
- 90-100: Perfect or near-perfect pronunciation, no casual speech, all words clear, no L1 influence patterns
- 80-89: Excellent - 1-2 minor pronunciation issues (e.g., one "gonna" or one TH→T substitution), otherwise clear
- 70-79: Good - 3-5 pronunciation issues (mix of casual words or TH/vowel errors), mostly understandable
- 60-69: Fair - 6-10 pronunciation issues (multiple TH substitutions, vowel collapses, or dropped endings), some difficulty understanding
- 40-59: Below Average - 11-20 pronunciation issues (consistent L1 patterns like TH→T, consonant cluster insertions), frequent problems
- 0-39: Poor - 20+ pronunciation issues (heavy L1 influence across multiple categories), very difficult to understand

For FILLER WORDS specifically:
- 90-100: No filler words detected
- 80-89: 1-2 filler words in entire speech
- 70-79: 3-5 filler words
- 60-69: 6-10 filler words
- 40-59: 11-20 filler words
- 0-39: 20+ filler words throughout

For SPEAKING PACE:
- 90-100: Perfect consistent pace, natural rhythm
- 80-89: Very good pace with minor variations
- 70-79: Good pace but some inconsistency
- 60-69: Noticeable pace issues but manageable
- 0-59: Significant pace problems

For EMOTIONAL DELIVERY:
- 90-100: Highly engaging, varied expression, perfect tone
- 80-89: Good expression and engagement
- 70-79: Adequate delivery, some expression
- 60-69: Monotone or limited expression
- 0-59: Very flat or inappropriate tone

COUNT ACTUAL ERRORS - Don't guess. If speech has only 1-2 issues, score should be 80-89. If speech is clean with no issues, score should be 90-100.

Also identify:
1. Common filler words (um, uh, you know, basically, literally, and "like" when used as filler - "is, like, really") - "like" as a verb or comparison ("I like it", "looks like") and words like "just", "really", "very" are legitimate word choice, not filler
2. Speaking pace and rhythm
3. Emotional delivery and tone${isReadingExercise ? '' : '\n4. Structure and coherence'}

GRAMMAR (for the "Grammar" feedback score only - a detailed grammar breakdown is produced separately): Score based on real grammar errors in the transcription (verb tense, subject-verb agreement, pronoun case, articles, prepositions, pluralization). Do not count disfluencies (filler words such as "like", "um", "you know"; false starts) as grammar errors - fillers are already scored under Filler Words. This is SPOKEN English transcribed by a machine - never count punctuation, hyphens, capitalization or spelling, which the speaker never said. A speech having grammar errors must NOT lower the Pronunciation Clarity score - pronunciation and grammar are separate categories; score Pronunciation Clarity purely on articulation/pronunciation of words, never on grammatical correctness.

TONE SUGGESTIONS: Tone (warmth, assertiveness, enthusiasm, formality) is something you can judge from word choice and phrasing in the text itself - this is not a prosody/audio claim. Find specific moments where the words used don't match what the purpose/audience/tone context calls for, and rewrite that exact phrase to demonstrate the better tone, keeping the speaker's own ideas (no new claims or facts). Every suggestion must be grounded in an exact phrase from the transcription - do not invent generic advice unrelated to what was actually said. Even when the tone broadly fits, still suggest how the most important moments could land more effectively.${speechConfig?.tone ? ` The speaker chose a "${speechConfig.tone}" tone - judge every phrase against that tone by name, and never steer it toward a different one (e.g. "more formal" for a persuasive speech).` : ''} A rewrite changes delivery and phrasing intensity only: keep the speaker's own claims and key words (drop fillers, reorder, add stress or a short intensifier) - never new claims, new vocabulary or a stronger meaning ("not just a trend" -> "a transformative shift in how we work" and "really changing how we do our jobs" -> "fundamentally transforming how we approach our jobs" are both wrong).`;
}

// Below this many words there usually aren't 4 distinct phrases to work with,
// so the "at least 4" minimums below are relaxed instead of forcing filler output.
const MIN_WORDS_FOR_FULL_SUGGESTIONS = 25;
// The client wants at least 4 content suggestions for every speech, even a strong one - only a
// near-empty recording gets fewer. For grammar and vocabulary 4 is a ceiling, not a quota:
// forcing 4 made the model invent fixes for clean speech.
const MIN_WORDS_FOR_FOUR_SUGGESTIONS = 12;

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function linguisticMinimums(transcription: string) {
  const minimum = countWords(transcription) >= MIN_WORDS_FOR_FOUR_SUGGESTIONS ? 4 : 2;
  return { grammar: minimum, vocabulary: minimum, content: minimum };
}

function createLinguisticPrompt(
  transcription: string,
  speechConfig?: any,
  detectedFillers?: ReturnType<typeof detectFillerWordsFromAudio> | null
): string {
  const isReadingExercise = speechConfig?.purposeKey === 'reading-exercise';
  const { grammar: minimum, vocabulary: vocabTarget } = linguisticMinimums(transcription);
  const isPractice = !!speechConfig?.practicePrompt;

  const fillerList = detectedFillers && detectedFillers.mistakes.length > 0
    ? detectedFillers.mistakes
        .map((m, i) => `${i}. "...${detectedFillers.contexts[i].before} [${m.text}] ${detectedFillers.contexts[i].after}..."`)
        .join('\n')
    : '';

  const vocabularySection = isReadingExercise
    ? `"vocabularyAnalysis": { "strengths": [], "weaknesses": [], "tips": [] }, // always empty - this is a reading exercise, the words aren't the speaker's own choice`
    : `"vocabularyAnalysis": {
    "strengths": [
      // 1-3 words/phrases the speaker used well (precise, vivid, varied) - empty array if none stand out
      { "word": "<word or short phrase actually used>", "context": "<why this was a strong choice>" }
    ],
    "weaknesses": [
      // ${vocabTarget > 0 ? `Up to ${vocabTarget} entries` : '0-2 entries'} - an empty array is the right answer when the wording already fits. Words/phrases the speaker actually used that could be upgraded: vague, generic, overused, repeated, or clichéd wording ("a lot", "very good", "nice", "things", "stuff", "good", "big", "really important").
      // Every upgrade must be something a fluent speaker would actually say aloud in THIS situation, to THIS audience, in the speaker's own register. Never make casual or conversational speech stiff or formal (e.g. "tell me" -> "inform me" is WORSE, not better). Never target function words, question words, or plain words that are already the natural choice ("which", "is", "the", "tell", "correct").
      // Keep the exact meaning - an "upgrade" that changes what was said is wrong (e.g. "daily practice" -> "consistent practice" drops the point that it's every day; "small misunderstandings" -> "petty disputes" and "snacks" -> "treats" mean different things).
      // Filler words ("basically", "literally", "actually", "like" or "you know" used as filler) are not vocabulary - they're scored as fillers; never list them here or offer synonyms for them.
      // A wrong or unnatural suggestion is worse than none: only include an entry if the replacement is clearly better, not just different (e.g. "said" -> "stated" is not an upgrade).
      {
        "word": "<the exact word or phrase from the transcription>",
        "alternatives": ["<3-4 stronger single words or short phrases that could replace it in THIS sentence>"],
        "betterPhrase": "<the speaker's own sentence/clause rewritten using a stronger phrase or collocation (e.g. 'very important' -> 'absolutely critical')>",
        "idiom": "<an English idiom or set expression that fits this idea, used in a short example sentence about the speaker's own point - e.g. 'a lot of work' -> 'It was an uphill battle', 'tried hard' -> 'We went the extra mile', 'very easy' -> 'It was a piece of cake'. Only include one when it sounds natural and professional for THIS audience and keeps exactly the same meaning - most entries should have an empty string. Never force an idiom; a wrong or odd idiom is worse than none>",
        "suggestion": "<one sentence on why the upgrade is stronger for this audience/purpose>"
      }
    ],
    "tips": [] // 1-2 short vocabulary tips specific to this speaker's habits
  },`;

  const contentSection = isReadingExercise
    ? `"contentQualityAnalysis": { "contextAlignment": null, "issues": [], "tips": [] }, // always empty - this is a reading exercise`
    : `"contentQualityAnalysis": {
    "contextAlignment": ${hasContentExpectations(speechConfig) ? `{
      // REQUIRED. Compare what the speaker actually talked about with the Speech Context above${isPractice ? ' - especially the practice question/prompt they were answering' : ''}.
      "summary": "<write this FIRST - 2-3 sentences: what the speaker was expected to cover, what they actually covered, and how well the two match. Name the specific topic/question - never generic.>",
      "status": "aligned|partial|off-topic",
      // Must agree with the summary. "off-topic" = the speech never actually addresses the expected topic${isPractice ? '/question' : ''} - it is about something else, even if it is a good speech or shares a word or setting with the topic (a project story under the topic "Remote work" is off-topic). If the topic is only mentioned in passing, or the main subject differs from the configured topic, it is "off-topic". "partial" = the speech genuinely covers the topic as its main subject, and you can name the specific part it misses or only hints at the main ask${isPractice ? ' of the question (e.g. the prompt asks for a story and the speaker only describes a scene)' : ''}, or drifts; "aligned" = it does what was asked, even if it could be sharper - ways to make a complete speech stronger belong in "issues", not here. If your summary says anything important was missed or not done, the status is NOT "aligned"; if it says the speech covers what was asked, the status IS "aligned".
      "missingPoints": ["<specific things ${isPractice ? 'a strong answer to this exact question' : 'a speech on this topic/context'} needed that are genuinely ABSENT from the transcription - re-read the transcription first and never list something the speaker said, even in other words. Empty array when the status is \"aligned\" - don't invent gaps in a complete answer>"]
    }` : 'null // no topic/context was given, so there is nothing to compare against'},
    "issues": [
      // AT LEAST ${minimum} entries - always give actionable suggestions, even for a strong speech (a strong speech can still have a sharper opening, a more concrete example, a clearer structure, or a more memorable close).
      // If contextAlignment.status is "off-topic" or "partial", the FIRST issue must be of type "off-topic" explaining the mismatch and how to refocus on the expected topic${isPractice ? '/question' : ''}.
      {
        "type": "off-topic|repetition|vague|missing-detail|structure|weak-opening|weak-closing",
        "excerpt": "<the exact phrase/sentence from the transcription this is about, or empty string if the issue is something missing rather than something said>",
        "problem": "<1-2 sentences: what specifically is weak here and why it hurts this speech's purpose for this audience>",
        "suggestion": "<2-3 sentences of CLEAR, concrete guidance: exactly what to add, cut, reorder, or say instead - name the specific kind of detail, example, number, or story that would fix it. Never generic advice like 'add more detail'.>",
        "example": "<a short rewritten version showing the fix applied, in the speaker's voice. Never invent facts, results, statistics, names or experiences the speaker didn't mention - put a placeholder where their real detail goes (e.g. 'I increased engagement by [your result]', 'at [company]')>"
      }
    ],
    "tips": [] // 1-2 tips on structuring this kind of speech${isPractice ? ' / answering this kind of question' : ''}
  },`;

  return `${buildSpeechContext(speechConfig)}${isReadingExercise ? '\nThis is a READING EXERCISE - the speaker is reading someone else\'s text aloud. Only grammar accuracy while reading applies; vocabulary and content quality are not assessed.\n' : ''}
Speech transcription:
"${transcription}"

You are an expert English language and communication coach. Produce a detailed language analysis of the transcription above, as a JSON object with EXACTLY this shape:

{
  "grammarAnalysis": {
    // Write this FIRST: the whole transcription with every grammar error fixed and NOTHING else changed (keep fillers, wording, and order - never delete a word, clause or question the speaker said). Then list every single change you made below - each change in correctedTranscript must appear as an "error" issue.
    "correctedTranscript": "<full corrected transcription>",
    "issues": [
      // Go through the transcription SENTENCE BY SENTENCE and check EVERY verb, pronoun, article, preposition, and plural - list EVERY real grammar error you find, not just the first one or two. Spoken transcripts of non-native speakers usually contain several.
      // Check every verb against its subject, including plural/"we"/"they" subjects ("we was" -> "we were", "they is" -> "they are") and third-person singular subjects missing -s ("my brother like" -> "my brother likes", "it taste" -> "it tastes", "she go" -> "she goes"). Report each error separately, even when several are in one sentence or follow the same pattern.
      // kind "error": a genuine grammatical mistake (verb tense, subject-verb agreement, pronoun case, article usage, preposition, pluralization, word order). Judge it as SPOKEN English: fragments, lists, long run-on sentences, starting with "and"/"so", leaving out an optional article, and repeated words or false starts ("I I", "we we") are normal in speech and are NOT errors - repetition is scored separately. Filler words (um, uh, like, basically, you know) are scored on their own card - never report a filler as a grammar error, never remove one as a grammar fix, and never mention one in an explanation. A sentence whose only problem is a filler has no grammar error.
      // The transcript comes from speech recognition and may contain its mistakes: a word that sounds the same or nearly the same as the right one ("laid"/"lay", "their"/"there", "then"/"than") is most likely the transcriber, not the speaker - at most a "refinement", never an "error".
      // kind "refinement": a sentence that is grammatically acceptable but would be clearer, more concise, or more polished for spoken English (e.g. awkward construction, passive voice that weakens the point, unnecessary words, informal construction like "me and him went"). It's optional polish, so word its explanation as a suggestion ("Consider...", "...would sound smoother") - never "is needed", "must", "always" or "incorrect".
      // List every real error, then at most ${minimum} "refinement" entries - only where a sentence would clearly sound better, never just different. A clean speech can have none: an empty list is right, a made-up fix ("'the' is needed" on a correct sentence, "simple" -> "straightforward") is wrong. Never label a refinement as an "error" - and never invent errors in correct sentences.
      {
        "kind": "error|refinement",
        "original": "<the exact phrase/sentence as transcribed>",
        "corrected": "<the same phrase/sentence, fixed or polished - must differ from original. For an \"error\", change only the words needed to fix it - do not reword anything else>",
        "errorType": "<specific category, e.g. 'verb tense', 'subject-verb agreement', 'pronoun case', 'article usage', 'preposition', 'sentence structure', 'conciseness'>",
        "explanation": "<one sentence on what was wrong or why the revision is better>"
      }
    ],
    "tips": [] // 1-2 short, memorable rules of thumb tied to the "error" entries found - empty array if there are none
  },
  ${vocabularySection}
  ${contentSection}
  "fillerAlternatives": [
    // One entry per numbered filler below (if any). For "um"/"uh" (pure hesitation sounds) and "basically"/"literally" (nothing to replace - just drop it) always return "alternatives": [] - the fix is a silent pause. For other fillers, suggest 1-2 plain spoken words that keep EXACTLY the same meaning in that sentence (e.g. "you know" before an example -> "for example"), or [] when nothing fits. Each alternative is 1-3 words - NEVER rewrite or repeat the sentence. Never suggest formal connectors ("moreover", "furthermore", "consequently", "in addition") or another filler ("like", "so", "basically").
    { "index": <filler number>, "alternatives": ["<word or phrase>", "<word or phrase>"] }
  ]
}

${fillerList ? `Filler words detected in the recording (the filler is in [brackets]):\n${fillerList}` : 'No filler words were detected - return "fillerAlternatives": [].'}

RULES:
- Every quoted "original", "word", and "excerpt" must be copied exactly from the transcription so it can be highlighted in the text.
- Grammar is about correctness/construction only. Word choice belongs in vocabularyAnalysis, and repeated/vague/off-topic ideas belong in contentQualityAnalysis - do not put the same observation in more than one section.
- Do not flag filler words, false starts, or transcription artifacts as grammar errors.
- Never change a verb's tense when the sentence is correct as said ("my brother liked to help" is fine) - only flag tense when the sentence itself shows the conflict ("yesterday I go").
- Never flag greetings, thanks or sign-offs ("Hi everyone", "Thank you", "Thanks for listening") in any section - they are correct as said.
- This was SPOKEN, then transcribed by a machine: the speaker never said any punctuation, hyphens, capitalization or spelling. Never flag those (e.g. "AI related" -> "AI-related" is NOT an error) - only mistakes you could hear. A word that looks misspelled or isn't a real word means the transcriber misheard it - never report it as a grammar, spelling or vocabulary mistake.
- Never invent facts, statistics, results, names or experiences the speaker didn't mention - use a placeholder like "[your result]" or "[example]" where their own detail belongs.
- If the transcription is empty, near-silent, or only a few words, return empty arrays rather than inventing content.
- Return ONLY the JSON object.`;
}

// Emphasis gets its own call that sees ONLY the transcript: with the topic /
// additional context in the same prompt, the model invented on-topic phrases
// for off-topic speeches instead of picking words the speaker actually said.
function createEmphasisPrompt(transcription: string): string {
  const minimum = countWords(transcription) >= MIN_WORDS_FOR_FULL_SUGGESTIONS ? 4 : 2;
  return `Speech transcription:
"${transcription}"

You are a public speaking coach. Pick AT LEAST ${minimum} phrases (up to 6) from the transcription above that the speaker should stress when delivering it: key claims, numbers, names, contrasts, turning points, vivid details, or the closing line. Always suggest some, even for a short or already strong speech - only return an empty array if the transcription is a handful of words.

Every "phrase" MUST be copied word-for-word from the transcription (2-8 consecutive words) - never paraphrase, never write words the speaker didn't say. Prefer phrases that are grammatically correct as spoken. This is a suggestion from the text; you cannot hear how the speaker actually stressed words.

Return ONLY this JSON:
{
  "emphasisSuggestions": {
    "phrases": [
      { "phrase": "<exact words from the transcription>", "reason": "<why stressing it strengthens the delivery>", "how": "<which exact word(s) to stress and how - e.g. 'Stress three and pause briefly before years'>" }
    ],
    "tips": ["<1-2 short tips on using emphasis in this speech>"]
  }
}`;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const lengthOf = (value: any) => (Array.isArray(value) ? value.length : 0);

// gpt-4o-mini treats "AT LEAST n" as a suggestion and often returns 1-3 items.
// Content only: grammar and vocabulary topped up to a quota invented fixes for clean
// speech ("'the' is needed", "trust" -> "faith"), so they show what's really there.
// If the content section came back short, ask once - in the same conversation, so it
// sees what it already gave - for only the missing number of NEW items, and
// append them.
async function topUpLinguisticAnalysis(prompt: string, data: any, transcription: string, isReadingExercise: boolean, apiKey: string): Promise<void> {
  const minimums = linguisticMinimums(transcription);
  const missing = {
    contentIssues: isReadingExercise ? 0 : Math.max(0, minimums.content - lengthOf(data?.contentQualityAnalysis?.issues)),
  };
  if (Object.values(missing).every(n => n === 0)) return;
  console.log('➕ Topping up short linguistic sections:', missing);

  const asks = [
    missing.contentIssues && `"contentIssues": exactly ${missing.contentIssues} more contentQualityAnalysis.issues entries (e.g. a sharper opening, a concrete example or number, clearer structure, a stronger close - with a placeholder like [your result] for any detail the speaker didn't give, never an invented one)`,
  ].filter(Boolean).join('\n- ');

  const extra = await requestLinguisticAnalysis([
    { role: 'user', content: prompt },
    { role: 'assistant', content: JSON.stringify(data) },
    { role: 'user', content: `Some sections have fewer suggestions than required. Return a JSON object with ONLY these keys, each an array of NEW items in the same shape as before - distinct from the ones you already gave, each quoting words actually in the transcription:\n- ${asks}\nEvery speech can be improved, so always provide the full number requested.` },
  ], apiKey, 1);
  if (!extra) return;

  const append = (section: string, key: string, items: any) => {
    if (!Array.isArray(items) || items.length === 0) return;
    data[section] = { ...(data[section] || {}), [key]: [...(data[section]?.[key] || []), ...items] };
  };
  append('contentQualityAnalysis', 'issues', extra.contentIssues);
}

// Focused JSON call (grammar/vocabulary/content quality, and emphasis). Returns null on
// failure so the main analysis still succeeds without these sections.
async function requestLinguisticAnalysis(prompt: string | ChatMessage[], apiKey: string, maxAttempts = 2): Promise<any | null> {
  const conversation = typeof prompt === 'string' ? [{ role: 'user' as const, content: prompt }] : prompt;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${OPENAI_API}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a meticulous English language coach. Return ONLY valid JSON.',
            },
            ...conversation,
          ],
        }),
      });
      if (!response.ok) {
        console.warn(`⚠️ Linguistic analysis attempt ${attempt} failed with ${response.status}`);
        continue;
      }
      const result = await response.json();
      return JSON.parse(result.choices[0].message.content);
    } catch (error) {
      console.warn(`⚠️ Linguistic analysis attempt ${attempt} threw`, error);
    }
  }
  return null;
}

async function generateImprovedSpeech(
  transcription: string,
  apiKey: string,
  speechConfig?: any,
  analysisData?: any
): Promise<{ annotated: string; clean: string }> {
  // Reading exercise: the better version is the passage itself, read as written - not a rewrite of it.
  const passage = speechConfig?.purposeKey === 'reading-exercise' && typeof speechConfig.readingPassage === 'string' ? speechConfig.readingPassage.trim() : '';
  if (passage && transcription.trim()) return { annotated: passage, clean: passage };
  try {
    const improvementPrompt = `${
      speechConfig?.purpose ? `Context: This is a ${speechConfig.purpose}${speechConfig.audience ? ` for ${speechConfig.audience}` : ''}${speechConfig.tone ? ` in a ${speechConfig.tone} tone` : ''}.\n\n` : ''
    }Original speech: "${transcription}"

Create an improved, rewritten version of this speech using this EXACT markup so it can be rendered with visual formatting:
- Use "|" (a single pipe character, surrounded by spaces) to mark where the speaker should pause. Place these at natural breath points and before/after key points — not after every sentence.
- Wrap words/phrases that should be spoken with emphasis in double asterisks, e.g. **truly transformative**.
- Wrap phrases where the speaker should slow down in single asterisks, e.g. *this specific phrase*. The wrapped words MUST be an exact phrase taken from the original speech (or your rewritten version of it) — never insert a generic phrase like "take a breath here" that the speaker never said. This text will be read aloud by text-to-speech, so it must only ever contain real content, not stage directions.
- If the speech is short or has no natural moment that calls for slowing down, it is correct and expected to use zero single-asterisk phrases — do not force one in just to use the markup type.
- Wrap any newly introduced vocabulary word, or any word that corrects a mispronunciation from the original, in double square brackets, e.g. [[articulate]].
- Do not use any other formatting or parentheses-based annotations.

Also:
1. Remove filler/hesitation sounds (um, uh, you know) - do not remove ordinary words like "like", "just", "really", "very", "actually" just because they can sometimes be filler; only remove them if they are genuinely redundant in context
2. Fix pronunciation issues including common non-native patterns:
   - TH sound errors: ${analysisData?.mispronuncedWords?.filter((w: any) => /\/[θð]\/|\bth\b|TH sound/i.test(w?.suggestion || ''))?.map((w: any) => w.word).join(', ') || 'none detected'}
   - Vowel errors: ${analysisData?.mispronuncedWords?.filter((w: any) => /vowel/i.test(w?.suggestion || ''))?.map((w: any) => w.word).join(', ') || 'none detected'}
   - All detected mispronunciations: ${analysisData?.mispronuncedWords?.map((w: any) => w.word).join(', ') || 'none detected'}
3. Improve structure and flow
4. Keep the core message and meaning
5. Do NOT invent content: no new facts, details, examples, names, numbers, experiences, or opinions the speaker didn't express (e.g. never add "the atmosphere was welcoming" if they didn't say anything about the atmosphere). You may reword, reorder, tighten, and use stronger vocabulary for what they DID say - every claim in your version must trace back to the original.
6. Keep the speaker's own greeting and sign-off (e.g. don't turn "Hello everyone" into "Good afternoon") - only fix errors in them

If the original speech above is empty, silent, just noise, or too short/repetitive to contain a real message (e.g. a couple of repeated words), do NOT invent new content or a polished speech that wasn't said. Instead, return the original text unchanged for both "annotated" and "clean" (no markup needed in this case).

Example of the expected markup style:
"Good evening, everyone. | I'm here to talk about something **truly important** to all of us. | [[Innovation]] isn't just a buzzword — *it's a discipline* we practice every day."

Return JSON:
{
  "annotated": "Improved speech WITH the | ** * [[ ]] markup described above",
  "clean": "The exact same wording WITHOUT any of that markup - pure plain text for TTS"
}`;

    const response = await fetch(`${OPENAI_API}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a speech improvement expert. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: improvementPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error('GPT improvement failed');
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    return {
      annotated: stripResidualFillerPossessives(parsed.annotated || createManualImprovement(transcription, analysisData).annotated),
      clean: stripResidualFillerPossessives(parsed.clean || createManualImprovement(transcription, analysisData).clean),
    };
  } catch (error) {
    console.error('⚠️ GPT improvement failed, using manual:', error);
    const manual = createManualImprovement(transcription, analysisData);
    return {
      annotated: stripResidualFillerPossessives(manual.annotated),
      clean: stripResidualFillerPossessives(manual.clean),
    };
  }
}

function createManualImprovement(
  transcription: string,
  analysisData?: any
): { annotated: string; clean: string } {
  const fillerWords = /,?\s*\b(um+|uh+|you know)\b,?/gi;
  let improved = transcription.replace(fillerWords, ' ');
  improved = improved.replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/^[\s,]+/, '').replace(/\s+/g, ' ').trim();

  const clean = improved;

  const sentences = improved.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) {
    const midPoint = Math.floor(sentences.length / 2);
    improved = `${sentences.slice(0, midPoint).join(' ')} | ${sentences.slice(midPoint).join(' ')}`;
  }

  return { annotated: improved, clean };
}

// Azure first: its American English voice follows the pause/stress markup.
// OpenAI (General American, plain text) only if Azure isn't configured or fails.
async function generateTTSAudio(
  text: string,
  apiKey: string,
  azure?: { markup: string; key?: string; region?: string; locale: Locale },
): Promise<{ audioUrl: string }> {
  if (azure?.key && azure.region) {
    try {
      return { audioUrl: mp3DataUrl(await synthesizeSpeech(azure.markup, azure.key, azure.region, azure.locale)) };
    } catch (error) {
      console.error('⚠️ Azure TTS failed, falling back to OpenAI:', error);
    }
  }
  return { audioUrl: mp3DataUrl(await openAISpeech(text, apiKey, azure?.locale)) };
}

function mp3DataUrl(arrayBuffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(arrayBuffer);
  // Convert to base64 in chunks to avoid stack overflow
  const CHUNK_SIZE = 8192;
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:audio/mpeg;base64,${btoa(binaryString)}`;
}

function createDefaultMetrics(transcription: string): SpeechMetrics {
  const words = transcription.split(/\s+/).filter(Boolean).length;
  return {
    totalWords: words,
    wordsPerMinute: 120,
    totalPauses: 0,
    pauseTimestamps: [],
    pronunciationAccuracy: 60,
    fillerWordPercentage: 10,
    speechDuration: Math.round((words / 120) * 60),
    sectionPace: [],
  };
}

// Combines the real, timestamp-derived pace/pause/filler data with the LLM's
// judgment-based score (pronunciation accuracy) that can't be measured from
// timestamps alone. Falls back to word-count/LLM estimates only when Whisper
// didn't return word timestamps.
function buildFinalMetrics(
  transcription: string,
  measuredMetrics: ReturnType<typeof computeMetricsFromWords> | null,
  llmMetrics: any,
  detectedFillerCount?: number,
  hasEnoughSpeech = true
): SpeechMetrics {
  const fallback = createDefaultMetrics(transcription);
  const totalWords = measuredMetrics?.totalWords ?? fallback.totalWords;
  const fillerWordPercentage = detectedFillerCount !== undefined && totalWords > 0
    ? Math.round((detectedFillerCount / totalWords) * 100)
    : (llmMetrics?.fillerWordPercentage ?? fallback.fillerWordPercentage);
  return {
    totalWords,
    // A "words per minute" rate extrapolated from a near-empty sample (near-silent
    // audio) is technically computable but meaningless - zero it rather than show
    // a misleadingly specific number like "20 WPM" for a transcript with no real speech.
    wordsPerMinute: hasEnoughSpeech ? (measuredMetrics?.wordsPerMinute ?? fallback.wordsPerMinute) : 0,
    totalPauses: measuredMetrics?.totalPauses ?? fallback.totalPauses,
    pauseTimestamps: measuredMetrics?.pauseTimestamps ?? fallback.pauseTimestamps,
    speechDuration: measuredMetrics?.speechDuration ?? fallback.speechDuration,
    sectionPace: measuredMetrics?.sectionPace ?? fallback.sectionPace,
    pronunciationAccuracy: llmMetrics?.pronunciationAccuracy ?? fallback.pronunciationAccuracy,
    fillerWordPercentage,
  };
}

function createDefaultToneAnalysis(): ToneAnalysis {
  return {
    primaryEmotion: 'neutral',
    formalityLevel: 'neutral',
    audienceSuitability: 'general',
    deliveryStyle: 'confident',
  };
}

// Built from the final (measured) scores, so it can't blame pronunciation that Azure scored 98.
function rationaleFor(feedback: { category: string; score: number }[]) {
  const sorted = feedback.filter(f => typeof f.score === 'number').sort((a, b) => a.score - b.score);
  const weakest = sorted[0], strongest = sorted[sorted.length - 1];
  return weakest.score >= 100 ? 'Perfect in every area.'
    : weakest.score >= 80
    ? `Strong across the board - every area scored 80 or above. Biggest room to reach 100: ${weakest.category} (${weakest.score}).`
    : `Held back most by ${weakest.category} (${weakest.score}); your strongest area was ${strongest.category} (${strongest.score}).`;
}

function createDefaultFeedback() {
  return [
    { category: 'Pronunciation Clarity', score: 60, feedback: 'Analysis incomplete', color: 'yellow' },
    { category: 'Speaking Pace', score: 60, feedback: 'Analysis incomplete', color: 'yellow' },
    { category: 'Emotional Delivery', score: 60, feedback: 'Analysis incomplete', color: 'yellow' },
    { category: 'Filler Words', score: 60, feedback: 'Analysis incomplete', color: 'yellow' },
    { category: 'Grammar', score: 60, feedback: 'Analysis incomplete', color: 'yellow' },
  ];
}

function createDefaultGrammarAnalysis() {
  return { issues: [], tips: [] };
}

function createDefaultVocabularyAnalysis() {
  return { strengths: [], weaknesses: [], tips: [] };
}

function createDefaultEmphasisSuggestions() {
  return { phrases: [], tips: [] };
}

function createDefaultToneSuggestions() {
  return { phrases: [], tips: [] };
}

function createDefaultContentQualityAnalysis() {
  return { issues: [], tips: [] };
}

function createDefaultCategoryScores(isReadingExercise = false) {
  const scores = [
    { name: 'Clarity', value: 60 },
    { name: 'Pace', value: 60 },
    { name: 'Emotion', value: 60 },
  ];
  if (!isReadingExercise) {
    scores.push({ name: 'Structure', value: 60 });
  }
  return scores;
}

// A prompt instruction alone proved unreliable at getting the model to admit
// "nothing to analyze" for near-silent/too-short audio - it kept generating
// polished, high, internally-contradictory scores instead. This deterministically
// overrides the model's analysis whenever there isn't enough real speech to
// judge, regardless of what it returned.
// Under ~10 words (a greeting, a few seconds) there's no pace, structure or delivery to
// judge - the model just guesses. A one-sentence answer ("I am X, pursuing a bachelor's
// in ...") is real speech and gets scored. Silence/hallucination is caught earlier by
// the Whisper no-speech checks, not by this count.
const MIN_WORDS_FOR_ANALYSIS = 10;

function createInsufficientAudioAnalysis(isReadingExercise: boolean) {
  const note = 'Not enough speech was captured in this recording to assess this.';
  const categoryScores = [
    { name: 'Clarity', value: 0 },
    { name: 'Pace', value: 0 },
    { name: 'Emotion', value: 0 },
  ];
  if (!isReadingExercise) {
    categoryScores.push({ name: 'Structure', value: 0 });
  }
  return {
    overallScore: 0,
    overallScoreRationale: note,
    pronunciationAccuracy: 0,
    toneAnalysis: { primaryEmotion: 'not assessed', formalityLevel: 'not assessed', audienceSuitability: 'not assessed', deliveryStyle: 'not assessed' },
    toneSuggestions: createDefaultToneSuggestions(),
    mispronuncedWords: [],
    feedback: [
      { category: 'Pronunciation Clarity', score: 0, feedback: note, color: 'red' },
      { category: 'Speaking Pace', score: 0, feedback: note, color: 'red' },
      { category: 'Emotional Delivery', score: 0, feedback: note, color: 'red' },
      { category: 'Filler Words', score: 0, feedback: note, color: 'red' },
      { category: 'Grammar', score: 0, feedback: note, color: 'red' },
    ],
    categoryScores,
    grammarAnalysis: createDefaultGrammarAnalysis(),
    vocabularyAnalysis: createDefaultVocabularyAnalysis(),
    contentQualityAnalysis: createDefaultContentQualityAnalysis(),
    emphasisSuggestions: createDefaultEmphasisSuggestions(),
  };
}
