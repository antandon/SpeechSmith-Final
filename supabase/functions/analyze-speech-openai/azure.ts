// Azure Speech pronunciation assessment: scores the actual sounds in the audio,
// instead of an LLM guessing pronunciation from Whisper's (already cleaned-up)
// transcript. Self-contained - no Deno APIs - so it can be checked with plain Node.

interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface PronunciationResult {
  accuracy: number;
  fluency: number | null;
  prosody: number | null;
  pronScore: number | null;
  // From Azure's per-word prosody feedback (only what Azure itself flags as an
  // error - its raw break confidences are high on almost every word).
  // null when Azure returned no prosody feedback at all - unknown, not "varied".
  monotone: boolean | null;
  pauses: { word: string; previous: string; kind: 'unexpected' | 'missing' }[];
  // Individual sounds Azure scored low across the whole speech, even in words
  // not bad enough to count as mispronounced - e.g. /θ/ in "think", "three".
  weakSounds: { sound: string; words: string[] }[];
  // Average score per sound (2+ occurrences), saved so the next report can show progress.
  soundScores: Record<string, number>;
  // Word clarity per third of the speech (same split as the pace sections).
  sections: { label: string; accuracy: number; pauseIssues: number }[];
  // Words held far longer, or rushed far shorter, than the speaker's own norm.
  timing: { word: string; kind: 'dragged' | 'clipped'; seconds: number }[];
  summary: string;
  mispronouncedWords: {
    word: string;
    correctWord: string;
    confidence: number;
    phoneticPronounced: string;
    phoneticCorrect: string;
    suggestion: string;
    // Azure's 0-100 accuracy for the word - the basis for flagging it.
    score: number;
    // 0-based: which occurrence of this word in the speech was flagged (absent if a chunk failed).
    occurrence?: number;
    // Letter groups with their scores, e.g. con(100) fi(39) dence(93).
    syllables?: { text: string; score: number }[];
  }[];
}

const SAMPLE_RATE = 16000;
// Speech is scored against American English only (IPA sounds and a prosody score included).
export type Locale = 'en-US';
// Azure caps pronunciation assessment at 30s per REST request; leave headroom
// for the padding added around each chunk.
const MAX_CHUNK_SECONDS = 25;
const CHUNK_PADDING_SECONDS = 0.5;
const MAX_FLAGGED_WORDS = 8;
const MAX_FLAGGED_PAUSES = 5;
const WEAK_PHONEME_SCORE = 60;
const MAX_WEAK_SOUNDS = 3;
const MAX_TIMING_WORDS = 5;
const FILLER = /^(u+m+|u+h+|a+h+|e+r+m*|h*m+)$/i;
// Whisper writes "250", "Rs", "Dr" where the speaker said the full words, so
// Azure scores them against sounds that were never meant to be said. Skip them.
const scorable = (w: any) => !/\d/.test(String(w.Word)) && /[aeiouy]/i.test(String(w.Word));

// Groups words into <=25s chunks, cutting in the silence between words so no
// word is clipped. Each chunk is scored against its own words as reference text
// (scripted assessment on Whisper's transcript - what Microsoft recommends over
// unscripted mode, whose built-in recognizer is less accurate).
export function planChunks(words: TimedWord[], totalSeconds: number) {
  const groups: TimedWord[][] = [];
  for (const word of words) {
    const current = groups[groups.length - 1];
    if (current && word.end - current[0].start <= MAX_CHUNK_SECONDS) current.push(word);
    else groups.push([word]);
  }
  return groups.map((group, i) => {
    const first = group[0];
    const last = group[group.length - 1];
    const gapBefore = i === 0 ? 0 : (groups[i - 1][groups[i - 1].length - 1].end + first.start) / 2;
    const gapAfter = i === groups.length - 1 ? totalSeconds : (last.end + groups[i + 1][0].start) / 2;
    return {
      startSec: Math.max(gapBefore, first.start - CHUNK_PADDING_SECONDS),
      endSec: Math.min(gapAfter, last.end + CHUNK_PADDING_SECONDS),
      text: group.map(w => w.word.trim()).join(' '),
    };
  });
}

// 44-byte RIFF header around raw 16-bit mono PCM.
export function wavFromPcm(pcm: Uint8Array): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

// The REST API returns scores flat on each object; the SDK's JSON nests them
// under PronunciationAssessment. Accept either.
const pa = (o: any) => o?.PronunciationAssessment ?? o;

async function assessChunk(pcm: Uint8Array, chunk: ReturnType<typeof planChunks>[number], key: string, region: string, locale: Locale) {
  // Sample-aligned (even) byte offsets into the 16-bit PCM.
  const from = Math.round(chunk.startSec * SAMPLE_RATE) * 2;
  const to = Math.min(pcm.length, Math.round(chunk.endSec * SAMPLE_RATE) * 2);
  const config = JSON.stringify({
    ReferenceText: chunk.text,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableProsodyAssessment: 'True',
    PhonemeAlphabet: 'IPA',
    NBestPhonemeCount: 1,
  });
  const response = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${SAMPLE_RATE}`,
        'Accept': 'application/json',
        'Pronunciation-Assessment': btoa(String.fromCharCode(...new TextEncoder().encode(config))),
      },
      body: wavFromPcm(pcm.subarray(from, to)),
    },
  );
  if (!response.ok) throw new Error(`Azure ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const best = json?.NBest?.[0];
  if (!best) console.warn('⚠️ Azure returned no result for chunk:', json?.RecognitionStatus);
  return best ? { seconds: chunk.endSec - chunk.startSec, best } : null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// complete = every chunk was scored; with a gap, thirds and word positions no longer line up with the speech.
export function summarize(chunks: { seconds: number; best: any }[], complete = true): PronunciationResult | null {
  // Duration-weighted so a 3s tail chunk doesn't count as much as a 25s one.
  const average = (field: string): number | null => {
    const scored = chunks.filter(c => typeof pa(c.best)?.[field] === 'number');
    const seconds = scored.reduce((sum, c) => sum + c.seconds, 0);
    return seconds > 0 ? Math.round(scored.reduce((sum, c) => sum + pa(c.best)[field] * c.seconds, 0) / seconds) : null;
  };
  const accuracy = average('AccuracyScore');
  if (accuracy === null) return null;

  const words = chunks.flatMap(c => (Array.isArray(c.best.Words) ? c.best.Words : []));
  const prosodyOf = (w: any) => pa(w)?.Feedback?.Prosody;
  // Intonation is judged per utterance, so every word in a flat chunk carries the flag.
  const monotone = !words.some((w: any) => prosodyOf(w)) ? null
    : words.filter((w: any) => prosodyOf(w)?.Intonation?.ErrorTypes?.includes('Monotone')).length > words.length / 2;
  // A word's Break is the gap before it.
  const breaks = words
    .map((w: any, i: number) => {
      const types: string[] = prosodyOf(w)?.Break?.ErrorTypes ?? [];
      const kind = types.includes('UnexpectedBreak') ? 'unexpected' as const : types.includes('MissingBreak') ? 'missing' as const : null;
      return kind && i > 0 ? { word: w.Word, previous: words[i - 1].Word, kind } : null;
    });
  const pauses = breaks
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .slice(0, MAX_FLAGGED_PAUSES);
  const listedPause = new Set(pauses);

  const seen = new Set<string>();
  const mispronouncedWords = words
    .filter((w: any) => pa(w)?.ErrorType === 'Mispronunciation' && scorable(w) && Array.isArray(w.Phonemes) && w.Phonemes.length > 0)
    .sort((a: any, b: any) => (pa(a).AccuracyScore ?? 100) - (pa(b).AccuracyScore ?? 100))
    .filter((w: any) => !seen.has(w.Word.toLowerCase()) && seen.add(w.Word.toLowerCase()))
    .slice(0, MAX_FLAGGED_WORDS)
    .map((w: any) => {
      // Which "the" it was (0-based among same words), so the transcript highlights that one.
      const at = words.indexOf(w);
      const occurrence = words.slice(0, at).filter((x: any) => String(x.Word).toLowerCase() === String(w.Word).toLowerCase()).length;
      const phonemes = w.Phonemes.map((p: any) => ({
        expected: p.Phoneme,
        heard: pa(p)?.NBestPhonemes?.[0]?.Phoneme ?? p.Phoneme,
        score: pa(p)?.AccuracyScore ?? 100,
      }));
      const worst = phonemes.reduce((a: any, b: any) => (b.score < a.score ? b : a));
      const syllables = (Array.isArray(w.Syllables) ? w.Syllables : [])
        .filter((s: any) => s.Grapheme)
        .map((s: any) => ({ text: String(s.Grapheme), score: pa(s)?.AccuracyScore ?? 100 }));
      const weakest = syllables.length > 1 ? syllables.reduce((a: any, b: any) => (b.score < a.score ? b : a)) : null;
      const split = syllables.map((s: any) => (s === weakest ? s.text.toUpperCase() : s.text)).join('·');
      // If Azure returns no IPA, fall back to the weakest syllable.
      const hasIpa = Boolean(worst.expected);
      const heard = `/${phonemes.map((p: any) => p.heard).join('')}/`;
      const correct = `/${phonemes.map((p: any) => p.expected).join('')}/`;
      const score = Math.round(pa(w).AccuracyScore ?? 0);
      return {
        word: w.Word,
        correctWord: w.Word,
        confidence: Math.round(100 - score) / 100,
        score,
        ...(complete ? { occurrence } : {}),
        // Azure often hears the right sounds, just faintly - then there's no different "your version" to show.
        phoneticPronounced: hasIpa && heard !== correct ? heard : '',
        phoneticCorrect: hasIpa ? correct : '',
        suggestion: !hasIpa
          ? weakest ? `The "${weakest.text}" in ${split} ${weakest.score < 20 ? 'was barely heard' : "wasn't clear"} (${weakest.score}/100) - stress and finish that part` : `"${w.Word}" wasn't clear - say it more deliberately`
          : worst.heard !== worst.expected
          ? `The /${worst.expected}/ sound came out closer to /${worst.heard}/ (${worst.score}/100) - focus on that sound in "${w.Word}"`
          : `The /${worst.expected}/ sound in "${w.Word}" ${worst.score < 20 ? 'was barely heard - make sure you say it' : 'was faint or unclear - say it fully'} (${worst.score}/100)`,
        ...(weakest && weakest.score < WEAK_PHONEME_SCORE ? { syllables } : {}),
      };
    });

  // Flagged words already get their own tip; this catches the quieter pattern.
  const flaggedWords = new Set(mispronouncedWords.map(w => w.word.toLowerCase()));
  const soundWords = new Map<string, Set<string>>();
  for (const w of words) {
    if (flaggedWords.has(String(w.Word).toLowerCase()) || !scorable(w)) continue;
    for (const p of Array.isArray(w.Phonemes) ? w.Phonemes : []) {
      const score = pa(p)?.AccuracyScore;
      if (typeof score !== 'number' || score >= WEAK_PHONEME_SCORE || !p.Phoneme) continue;
      if (!soundWords.has(p.Phoneme)) soundWords.set(p.Phoneme, new Set());
      soundWords.get(p.Phoneme)!.add(String(w.Word).toLowerCase());
    }
  }
  const weakSounds = [...soundWords]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, MAX_WEAK_SOUNDS)
    .map(([sound, inWords]) => ({ sound, words: [...inWords].slice(0, 3) }));

  const soundTotals = new Map<string, number[]>();
  for (const w of words) for (const p of Array.isArray(w.Phonemes) ? w.Phonemes : []) {
    const score = pa(p)?.AccuracyScore;
    if (!p.Phoneme || typeof score !== 'number') continue;
    if (!soundTotals.has(p.Phoneme)) soundTotals.set(p.Phoneme, []);
    soundTotals.get(p.Phoneme)!.push(score);
  }
  const soundScores = Object.fromEntries([...soundTotals]
    .filter(([, scores]) => scores.length >= 2)
    .map(([sound, scores]) => [sound, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)]));

  // Thirds by word count, matching the pace sections; too few words is just noise.
  const sections: PronunciationResult['sections'] = [];
  if (complete && words.length >= 9) {
    const size = Math.ceil(words.length / 3);
    ['Opening', 'Middle', 'Closing'].forEach((label, i) => {
      const part = words.slice(i * size, (i + 1) * size);
      const scores = part.map((w: any) => pa(w)?.AccuracyScore).filter((s: any) => typeof s === 'number');
      if (!scores.length) return;
      sections.push({
        label,
        accuracy: Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length),
        // Only the pauses listed in the report, so "3 awkward pauses there" matches what's shown.
        pauseIssues: breaks.slice(i * size, (i + 1) * size).filter(b => b && listedPause.has(b)).length,
      });
    });
  }

  // ponytail: duration-per-sound vs the speaker's median is a rough proxy; it can't
  // tell deliberate emphasis from a drag. Swap for Azure's word-level rate if exposed.
  const perSound = (w: any) => (w.Duration ?? 0) / 1e7 / Math.max(1, Array.isArray(w.Phonemes) ? w.Phonemes.length : String(w.Word).length);
  const speakers = words.filter((w: any) => !FILLER.test(w.Word) && w.Duration);
  const norm = median(speakers.map(perSound));
  const timing = norm > 0 ? speakers
    .map((w: any) => {
      const ratio = perSound(w) / norm;
      const seconds = Math.round(w.Duration / 1e6) / 10;
      const sounds = Array.isArray(w.Phonemes) ? w.Phonemes.length : 0;
      return ratio >= 2.5 && seconds >= 0.6 ? { word: w.Word, kind: 'dragged' as const, seconds }
        : ratio <= 0.45 && sounds >= 3 ? { word: w.Word, kind: 'clipped' as const, seconds }
        : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .slice(0, MAX_TIMING_WORDS) : [];

  const flagged = mispronouncedWords.slice(0, 3).map(w => `"${w.word}"`).join(', ');
  const summary = `${accuracy >= 80 ? 'Clear pronunciation overall' : accuracy >= 60 ? 'Mostly clear, with some sounds that need work' : 'Several sounds need work'} - measured ${accuracy}/100 from your audio.`
    + (flagged ? ` Practice: ${flagged}.` : '')
    + (weakSounds.length ? ` Sounds to sharpen: ${weakSounds.map(s => `/${s.sound}/ (${s.words.map(w => `"${w}"`).join(', ')})`).join(', ')}.` : '')
    + (!flagged && !weakSounds.length && accuracy < 100 ? ' To reach 100: finish every word ending (t, d, s) fully and don\'t swallow unstressed syllables.' : '');

  return { accuracy, fluency: average('FluencyScore'), prosody: average('ProsodyScore'), pronScore: average('PronScore'), monotone, pauses, weakSounds, soundScores, sections, timing, summary, mispronouncedWords };
}

// pcm: 16kHz 16-bit mono little-endian, as produced by the browser.
// Chunks that fail are dropped; null only if none could be scored.
export async function assessPronunciation(pcm: Uint8Array, words: TimedWord[], key: string, region: string, locale: Locale = 'en-US'): Promise<PronunciationResult | null> {
  const chunks = planChunks(words, pcm.length / 2 / SAMPLE_RATE);
  const results = await Promise.all(chunks.map(chunk =>
    assessChunk(pcm, chunk, key, region, locale).catch(error => {
      console.warn('⚠️ Azure pronunciation chunk failed:', error);
      return null;
    })
  ));
  return summarize(results.filter((r): r is NonNullable<typeof r> => r !== null), results.every(r => r !== null));
}

// Reading exercise: what was read vs the passage, word by word (LCS alignment).
// Done on the transcript rather than Azure's miscue mode, which only sees each
// 25s chunk and Whisper's text, not the passage.
// ponytail: Whisper may write "20" for "twenty" - that counts as a misread. Normalise numbers if it shows up.
export function compareReading(passage: string, spoken: string) {
  const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").split(/[^a-z0-9']+/).filter(w => w && !FILLER.test(w));
  const a = norm(passage), b = norm(spoken);
  if (!a.length) return null;
  // dp[i][j] = LCS length of a[i:], b[j:]
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const skipped: string[] = [], extra: string[] = [], misread: { expected: string; said: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    // A passage word and a spoken word dropped at the same spot = one was read as the other.
    if (i < a.length && j < b.length && dp[i + 1][j + 1] === dp[i][j]) { misread.push({ expected: a[i++], said: b[j++] }); continue; }
    if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) skipped.push(a[i++]);
    else extra.push(b[j++]);
  }
  return { accuracy: Math.round(dp[0][0] / a.length * 100), skipped, extra, misread };
}

// Natural American English voice for the model speech.
const VOICES: Record<Locale, string> = { 'en-US': 'en-US-JennyNeural' };

// Fallback when Azure isn't configured or fails: gpt-4o-mini-tts told to speak General American.
const OPENAI_VOICES: Record<Locale, { voice: string; accent: string }> = {
  'en-US': { voice: 'nova', accent: 'General American' },
};

export async function openAISpeech(text: string, apiKey: string, locale?: Locale, voice = 'nova'): Promise<ArrayBuffer> {
  const accent = locale && OPENAI_VOICES[locale];
  // OpenAI can't follow the pause/stress markup Azure gets, so it would read it out.
  const input = text.replace(/[|*]|\[\[|\]\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4096);
  const speak = (body: Record<string, string>) => fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, response_format: 'mp3', ...body }),
  });
  let response = accent
    ? await speak({ model: 'gpt-4o-mini-tts', voice: accent.voice, instructions: `Speak with a natural ${accent.accent} English accent, clearly and at a steady presenting pace.` })
    : null;
  // tts-1 if this key can't use gpt-4o-mini-tts: same voice, just no accent steering.
  if (!response?.ok) {
    if (response) console.error('⚠️ gpt-4o-mini-tts failed, using tts-1:', response.status);
    response = await speak({ model: 'tts-1', voice: accent?.voice ?? voice });
  }
  if (!response.ok) throw new Error(`OpenAI TTS failed: ${response.status} ${await response.text().catch(() => '')}`);
  return response.arrayBuffer();
}

// The improved speech's markup -> SSML, so the voice actually does what the text shows:
// "|" pause, **x** stress, *x* slow down, [[x]] plain. Plain text passes straight through.
export function ssmlFor(markup: string, locale: Locale) {
  const body = markup
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\s*\|\s*/g, ' <break time="600ms"/> ')
    .replace(/\*\*(.+?)\*\*/g, '<prosody pitch="+10%" volume="+15%">$1</prosody>')
    .replace(/\*(.+?)\*/g, '<prosody rate="-15%">$1</prosody>')
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .replace(/\*|\[\[|\]\]/g, '')
    .replace(/\s+/g, ' ').trim();
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${VOICES[locale]}">${body}</voice></speak>`;
}

export async function synthesizeSpeech(markup: string, key: string, region: string, locale: Locale): Promise<ArrayBuffer> {
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'speechsmith',
    },
    body: ssmlFor(markup, locale),
  });
  if (!response.ok) throw new Error(`Azure TTS ${response.status}: ${await response.text()}`);
  return response.arrayBuffer();
}
