// Run: node supabase/functions/analyze-speech-openai/azure.test.ts
import assert from 'node:assert/strict';
import { compareReading, planChunks, ssmlFor, summarize, wavFromPcm } from './azure.ts';

// 70s of speech, one word every 0.5s with a 2s silence at 30s.
const words = Array.from({ length: 136 }, (_, i) => {
  const start = i * 0.5 + (i >= 60 ? 2 : 0);
  return { word: ` w${i}`, start, end: start + 0.4 };
});
const chunks = planChunks(words, 70);
assert.ok(chunks.length >= 3);
for (const c of chunks) assert.ok(c.endSec - c.startSec <= 30, `chunk too long: ${c.endSec - c.startSec}`);
assert.equal(chunks.map(c => c.text).join(' '), words.map(w => w.word.trim()).join(' '));
for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].startSec >= chunks[i - 1].endSec, 'chunks overlap');
assert.deepEqual(planChunks([], 5), []);

const wav = wavFromPcm(new Uint8Array(32000));
assert.equal(wav.length, 44 + 32000);
assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF');

// REST shape (flat scores) and SDK shape (nested) are both understood.
const word = (w: string, acc: number, err: string, heard = 'd') => ({
  Word: w, AccuracyScore: acc, ErrorType: err,
  Phonemes: [{ Phoneme: 'ð', AccuracyScore: acc, NBestPhonemes: [{ Phoneme: heard, Score: 80 }] }, { Phoneme: 'ə', AccuracyScore: 95 }],
});
const result = summarize([
  { seconds: 20, best: { AccuracyScore: 60, FluencyScore: 90, Words: [word('the', 30, 'Mispronunciation'), word('cat', 95, 'None')] } },
  { seconds: 5, best: { PronunciationAssessment: { AccuracyScore: 100 }, Words: [{ Word: 'The', PronunciationAssessment: { AccuracyScore: 40, ErrorType: 'Mispronunciation' }, Phonemes: [{ Phoneme: 'ð' }] }] } },
]);
assert.ok(result);
assert.equal(result.accuracy, 68); // (60*20 + 100*5) / 25
assert.equal(result.fluency, 90);
assert.equal(result.prosody, null);
assert.equal(result.mispronouncedWords.length, 1); // "the"/"The" deduped, "cat" not flagged
assert.equal(result.mispronouncedWords[0].phoneticPronounced, '/də/');
assert.equal(result.mispronouncedWords[0].phoneticCorrect, '/ðə/');
assert.match(result.mispronouncedWords[0].suggestion, /\/ð\/ sound came out closer to \/d\//);
assert.equal(result.mispronouncedWords[0].score, 30);
assert.equal(result.mispronouncedWords[0].occurrence, 0); // the first "the", not "The" in chunk 2
// Second "the" flagged -> occurrence 1; a failed chunk drops occurrence (positions unreliable).
const second = [{ seconds: 5, best: { AccuracyScore: 70, Words: [word('the', 95, 'None'), word('cat', 95, 'None'), word('the', 20, 'Mispronunciation')] } }];
assert.equal(summarize(second)!.mispronouncedWords[0].occurrence, 1);
assert.equal(summarize(second, false)!.mispronouncedWords[0].occurrence, undefined);
// Numbers/abbreviations Whisper wrote as "250"/"Rs" aren't flagged; when Azure heard
// the right sounds (just faintly) there's no separate "your pronunciation" to show.
const faint = summarize([{ seconds: 5, best: { AccuracyScore: 50, Words: [
  word('250', 10, 'Mispronunciation'), word('Rs', 10, 'Mispronunciation'), word('she', 40, 'Mispronunciation', 'ð'),
] } }])!.mispronouncedWords;
assert.deepEqual(faint.map(w => w.word), ['she']);
assert.equal(faint[0].phoneticPronounced, '');
assert.equal(faint[0].phoneticCorrect, '/ðə/');
assert.match(faint[0].suggestion, /faint or unclear .*\(40\/100\)/);
// Low-scoring sounds in words not already flagged, most widespread first.
assert.deepEqual(result.weakSounds, []); // "the" is already a mispronounced word
const sounds = summarize([{ seconds: 5, best: { AccuracyScore: 85, Words: [
  { Word: 'think', AccuracyScore: 75, ErrorType: 'None', Phonemes: [{ Phoneme: 'θ', AccuracyScore: 40 }, { Phoneme: 'ɪ', AccuracyScore: 90 }] },
  { Word: 'three', AccuracyScore: 75, ErrorType: 'None', Phonemes: [{ Phoneme: 'θ', AccuracyScore: 50 }, { Phoneme: 'r', AccuracyScore: 55 }] },
] } }]);
assert.ok(sounds);
assert.deepEqual(sounds.weakSounds, [{ sound: 'θ', words: ['think', 'three'] }, { sound: 'r', words: ['three'] }]);
assert.match(sounds.summary, /Sounds to sharpen: \/θ\/ \("think", "three"\)/);
assert.equal(summarize([{ seconds: 5, best: {} }]), null);

// Prosody: only Azure's own ErrorTypes count, not its raw confidences.
const prosodic = (w: string, breakTypes: string[], intonation: string[]) => ({
  Word: w, AccuracyScore: 90, ErrorType: 'None',
  Feedback: { Prosody: { Break: { ErrorTypes: breakTypes, UnexpectedBreak: { Confidence: 1 } }, Intonation: { ErrorTypes: intonation } } },
});
const prosody = summarize([{ seconds: 3, best: { AccuracyScore: 90, Words: [
  prosodic('we', ['None'], ['Monotone']), prosodic('build', ['UnexpectedBreak'], ['Monotone']), prosodic('and', ['MissingBreak'], []),
] } }]);
assert.ok(prosody);
assert.equal(prosody.monotone, true); // 2 of 3 words
assert.deepEqual(prosody.pauses, [
  { word: 'build', previous: 'we', kind: 'unexpected' },
  { word: 'and', previous: 'build', kind: 'missing' },
]);
assert.equal(result.monotone, null); // no prosody feedback = unknown, not "varied"
assert.equal(prosody.monotone !== null && summarize([{ seconds: 3, best: { AccuracyScore: 90, Words: [prosodic('hi', ['None'], [])] } }])!.monotone, false);
assert.deepEqual(result.pauses, []);
assert.deepEqual(prosody.weakSounds, []); // no phoneme data

// Sound averages (2+ samples) for progress tracking.
assert.deepEqual(sounds.soundScores, { 'θ': 45 });

// Syllables: weak one shown; non-US (no IPA) falls back to it in the tip.
const syl = (Phoneme: string) => summarize([{ seconds: 3, best: { AccuracyScore: 50, Words: [{
  Word: 'confidence', AccuracyScore: 46, ErrorType: 'Mispronunciation',
  Syllables: [{ Grapheme: 'con', AccuracyScore: 100 }, { Grapheme: 'fi', AccuracyScore: 39 }, { Grapheme: 'dence', AccuracyScore: 93 }],
  Phonemes: [{ Phoneme, AccuracyScore: 40 }],
}] } }])!.mispronouncedWords[0];
assert.deepEqual(syl('ɪ').syllables?.map(s => s.text), ['con', 'fi', 'dence']);
assert.equal(syl('').phoneticCorrect, '');
assert.match(syl('').suggestion, /"fi" in con·FI·dence/);

// Sections + dragged/clipped: 9 words, 0.1s per sound; "so" dragged, "everybody" clipped.
const timed = (Word: string, n: number, secs: number, acc = 90, brk = 'None') => ({
  Word, AccuracyScore: acc, ErrorType: 'None', Duration: secs * 1e7,
  Phonemes: Array.from({ length: n }, () => ({ Phoneme: 'a', AccuracyScore: acc })),
  Feedback: { Prosody: { Break: { ErrorTypes: [brk] }, Intonation: { ErrorTypes: [] } } },
});
const paced = summarize([{ seconds: 9, best: { AccuracyScore: 80, Words: [
  timed('so', 2, 0.9), timed('we', 2, 0.2), timed('can', 3, 0.3),
  timed('all', 2, 0.2), timed('try', 3, 0.3), timed('it', 2, 0.2),
  timed('everybody', 7, 0.2, 50), timed('umm', 2, 2, 90, 'UnexpectedBreak'), timed('yes', 3, 0.3, 50),
] } }])!;
assert.deepEqual(paced.sections.map(s => [s.label, s.accuracy, s.pauseIssues]), [['Opening', 90, 0], ['Middle', 90, 0], ['Closing', 63, 1]]);
assert.deepEqual(summarize([{ seconds: 9, best: { AccuracyScore: 80, Words: Array.from({ length: 9 }, () => timed('a', 1, 0.2)) } }], false)!.sections, []);
assert.deepEqual(paced.timing, [{ word: 'so', kind: 'dragged', seconds: 0.9 }, { word: 'everybody', kind: 'clipped', seconds: 0.2 }]);

// Reading check: skipped, extra, misread; fillers and punctuation ignored.
assert.deepEqual(compareReading('The quick brown fox jumps over the lazy dog.', 'the quick, umm, brown box jumps the very lazy dog'), {
  accuracy: 78, skipped: ['over'], extra: ['very'], misread: [{ expected: 'fox', said: 'box' }],
});
assert.equal(compareReading('  ', 'hi'), null);

// Markup -> SSML: pause, stress, slow-down, vocabulary brackets, and XML escaping.
const ssml = ssmlFor('Hi & welcome. | This is **truly important** and *worth it*, [[articulate]] <3', 'en-US');
assert.ok(ssml.includes('<voice name="en-US-JennyNeural">'));
assert.ok(ssml.includes('Hi &amp; welcome. <break time="600ms"/> This is <prosody pitch="+10%" volume="+15%">truly important</prosody> and <prosody rate="-15%">worth it</prosody>, articulate &lt;3'));

console.log('azure.ts checks passed');
