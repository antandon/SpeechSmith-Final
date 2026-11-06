// Rules for what counts as a mistake in SPEECH (not in Whisper's text). Shared by the
// analysis function and the app, which applies them to reports saved before a rule existed.

// Spelling, punctuation and capitalization exist only in Whisper's text, never in the
// speech: a "misspelled" word is Whisper mishearing ("DIDERENT"), not the speaker's mistake.
// The prompt says so, but the model still flags them, so they're dropped here.
// Grammar tips about writing (punctuation) or delivery (repeats, fillers, pauses) don't belong on the Grammar card.
export const NOT_GRAMMAR_TIP = /spell|punctuat|capitali[sz]|semicolon|comma|full stop|period|apostrophe|hyphen|run-?on|repetit|repeat|filler|pause/i;
export const isWrittenOnlyIssue = (type: unknown, explanation: unknown) =>
  /spell|typo|punctuat|capitali[sz]|hyphen/i.test(typeof type === 'string' ? type : '') ||
  // A fix explained by punctuation ("using semicolons clarifies the list") is a writing fix too.
  /misspel|spelling|typo|punctuat|semicolon|\bcolons?\b|\bcommas?\b|full stop/i.test(typeof explanation === 'string' ? explanation : '');

// What a listener hears: case, punctuation and hyphens stripped ("AI-related," -> "ai related").
export const spokenWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

// "Thank you", "Hi everyone" are correct as said - never a grammar or vocabulary fix.
export const isCourtesy = (text: string) => {
  const words = spokenWords(text).split(' ');
  return words.length <= 5 && /^(thank|thanks|hi|hello|hey|good (morning|afternoon|evening)|goodbye|bye)\b/.test(words.join(' '));
};

// Things that are normal in speech, not grammar mistakes: run-ons and fragments are
// Whisper's punctuation, repeated words ("I I") are already scored under Repetition.
export const NOT_SPOKEN_GRAMMAR = /run-?on|fragment|punctuat|repetit|repeat|stutter|false start|filler/i;
const ARTICLES = new Set(['a', 'an', 'the']);
const SUBJECTS = new Set(['i', 'we', 'you', 'he', 'she', 'it', 'they', 'there', 'this', 'that', "i'll", "we'll", "i'm", "we're", "it's", "that's", "there's"]);
const AUXILIARIES = new Set(['is', 'am', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must', 'have', 'has', 'had', 'do', 'did', 'be', 'been']);

const SPOKEN_FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'hmm', 'like', 'basically', 'literally', 'actually', 'just', 'really', 'you', 'know', 'mean', 'kind', 'sort', 'of', 'so', 'and', 'then', 'well', 'okay', 'ok', 'right']);
const SOUND_ALIKE = [['their', 'there', "they're"], ['your', "you're"], ['its', "it's"], ['to', 'too', 'two'], ['then', 'than'],
  ['lay', 'laid', 'lie', 'lied'], ['affect', 'effect'], ['accept', 'except'], ['weather', 'whether'], ['lose', 'loose'],
  ['whose', "who's"], ['were', "we're"], ['of', 'have'], ['quite', 'quiet']];
// ponytail: spelling-based rhyme check (same last 4 letters, different start) - a phonetic
// key (Metaphone) would catch more, e.g. "write"/"right".
const soundAlike = (a: string, b: string) =>
  SOUND_ALIKE.some(g => g.includes(a) && g.includes(b)) ||
  (a.length >= 5 && b.length >= 5 && a.slice(-4) === b.slice(-4) && a.slice(0, 2) !== b.slice(0, 2));
// "basically", "you know" - filler, not a word choice to upgrade or a grammar error to fix.
export const isFillerOnly = (words: string[]) => words.length > 0 && words.every(w => SPOKEN_FILLERS.has(w));
const withoutFillers = (text: string) => spokenWords(text).split(' ').filter(w => !SPOKEN_FILLERS.has(w)).join(' ');

// Whisper's per-word timestamps carry no punctuation - take it back from the transcript text,
// matching words in order (a short lookahead steps over tokens split differently, e.g. "AI-related").
export const punctuatedWords = (words: string[], text: string): string[] => {
  const tokens = text.split(/\s+/).filter(Boolean);
  let j = 0;
  return words.map(w => {
    const key = spokenWords(w);
    for (let t = j; t < Math.min(tokens.length, j + 4); t++) {
      if (spokenWords(tokens[t]) === key) { j = t + 1; return tokens[t]; }
    }
    return w;
  });
};

// "like" after these is a verb or comparison: "I like pizza", "would like", "looks like rain", "feel like".
const LIKE_IS_REAL_AFTER = new Set(['i', 'you', 'we', 'they', 'would', "i'd", "we'd", 'do', 'does', 'did', "don't", "didn't", 'to', 'really', 'also',
  'look', 'looks', 'looked', 'looking', 'feel', 'feels', 'felt', 'feeling', 'seem', 'seems', 'seemed', 'sound', 'sounds', 'sounded',
  'something', 'anything', 'nothing', 'just', 'more', 'much', 'exactly']);
// "like" before these is a preposition: "it was like a dream", "like my dad".
const LIKE_OBJECT = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'some', 'any',
  'it', 'him', 'them', 'me', 'us', 'you', 'when', 'what', 'how']);
const endsWithComma = (raw: string) => /,\s*$/.test(raw);
// "like" is filler when followed by a comma ("is, like, really") or quotative ("I was like no way") -
// not as a verb or preposition. Pass the punctuated words (punctuatedWords).
// ponytail: word-context rules, no parser - "it was like magic" still counts as quotative.
export const isFillerLike = (prevRaw: string, likeRaw: string, nextRaw = '') => {
  const prev = spokenWords(prevRaw), next = spokenWords(nextRaw);
  if (LIKE_IS_REAL_AFTER.has(prev) && !endsWithComma(prevRaw)) return false;
  // A comma after it marks an aside; one only before it is usually an example ("cities, like Paris").
  if (endsWithComma(likeRaw)) return true;
  return ['was', 'were', "i'm"].includes(prev) && !!next && !LIKE_OBJECT.has(next);
};

// The words a fix removes and adds, around the part that stays the same.
export const changedWords = (original: string, corrected: string) => {
  const a = spokenWords(original).split(' ').filter(Boolean);
  const b = spokenWords(corrected).split(' ').filter(Boolean);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let e = 0;
  while (e < a.length - p && e < b.length - p && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return { a, p, removed: a.slice(p, a.length - e), added: b.slice(p, b.length - e) };
};

// Classifies a grammar fix by the words it changes: 'drop' = removes an immediately repeated
// word/phrase ("I I went" -> "I went") or rewrites most of it; 'optional' = only adds an article ("I've been
// class representative" -> "a class representative"), or adds a subject + verb to a list item or fragment
// ("First, extend the hours" -> "First, I will extend") - normal in speech, so shown as
// polish, not counted as an error; 'keep' = a real change.
// Abstract/uncountable nouns and plurals read correctly with no article in a general statement
// ("gives people flexibility", "we need options") - adding one there isn't a fix.
// ponytail: suffix guess, not a real countability check; a noun list if it misfires.
const NO_ARTICLE_NEEDED = /(ity|ness|ment|tion|sion|ism|ance|ence|ship|ing|[^su]s)$/;

export const classifyGrammarFix = (original: string, corrected: string): 'drop' | 'optional' | 'keep' => {
  const { a, p, removed, added } = changedWords(original, corrected);
  // A "fix" that keeps under half the speaker's words is a rewrite of what they said
  // (e.g. swapping in the expected topic), not a grammar correction.
  const kept = spokenWords(corrected).split(' ');
  if (a.length >= 4 && a.filter(w => kept.includes(w)).length < a.length / 2) return 'drop';
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((w, i) => w === y[i]);
  // Removing only fillers/connectors is the run-on/filler "fix" - fillers are scored on their own card;
  // removing 3+ words is cutting what the speaker said ("do you know what time it is?" gone).
  if (added.length === 0 && removed.length >= 3) return 'drop';
  // Only fillers differ ("is, like, really changing how we, like, do" -> "is really changing how we do").
  if (withoutFillers(original) === withoutFillers(corrected)) return 'drop';
  // Words that sound the same or rhyme are a transcriber's guess ("lay" heard as "laid", "options"
  // as "auctions") - we can't tell which one was said, so it's not the speaker's mistake to show.
  if (removed.length === 1 && added.length === 1 && soundAlike(removed[0], added[0])) return 'drop';
  if (added.length === 0 && removed.length > 0 &&
      ((p >= removed.length && same(a.slice(p - removed.length, p), removed)) || same(a.slice(p + removed.length, p + 2 * removed.length), removed))) return 'drop';
  if (removed.length === 0 && added.length === 1 && ARTICLES.has(added[0]) && NO_ARTICLE_NEEDED.test(a[p] || '')) return 'drop';
  if (removed.length === 0 && added.length > 0 &&
      (added.every(w => ARTICLES.has(w)) ||
        (SUBJECTS.has(added[0]) && added.every(w => SUBJECTS.has(w) || AUXILIARIES.has(w) || ARTICLES.has(w))))) return 'optional';
  return 'keep';
};

// Content issues that call a greeting or "Thank you" vague/off-topic are wrong; advice on a
// weak opening or close stays, just without highlighting the courtesy phrase.
export const courtesyContentIssue = (type: string, excerpt: string): 'drop' | 'unquote' | 'keep' =>
  !excerpt || !isCourtesy(excerpt) ? 'keep' : /weak-(opening|closing)|structure/.test(type) ? 'unquote' : 'drop';

// The model's badge sometimes contradicts its own summary ("aligned" over "didn't answer the
// question", "partial" over "entirely off topic") - the summary wins.
// ponytail: phrase match on the summary - a mismatch described in other words gets through.
const OFF_TOPIC_SUMMARY = /\b(entirely|completely|totally|wholly|is all) (off[- ]topic|unrelated|about something else)|\bnothing to do with\b|\b(not|never) (related|relevant) to the (topic|question|prompt) at all|\bunrelated to the (stated |given |assigned )?(topic|question|prompt)\b|\b(only|merely|just) (mentions?|touches on|refers to|references)\b.{0,60}\bin passing\b|\bmain (subject|focus|topic) is\b.{0,60}\b(rather than|not|instead of)\b|\b((does|did)( not|n't)|never|fails to|failed to) (address|mention|discuss|touch on|engage with|relate to)(es|s|ed)? (the (stated |given |assigned )?(topic|question|prompt)( at all)?[.,;]|.{0,40}\bat all\b)/i;
// A gap is a negated coverage verb - bare "didn't"/"rather than" also appear in praise of a
// fully on-topic speech ("focused on practice rather than theory") and wrongly downgraded it.
const GAP_SUMMARY = /\b((did|does|do)( not|n't)|failed to|fails to|not|never|without)( fully| directly| really| clearly| actually)? (answer|address|tell|cover|respond|explain|depict|show|mention|discuss|include|describe|give|provide)(s|ed|ing)?\b|\b(missed|misses|missing|lacks|lacking|drifts?|strays?)\b/i;
const ALIGNED_SUMMARY = /\b(aligns?|aligned|fits?|matches|answers|addresses|covers|stays?|is) (well|fully|directly|closely|completely|clearly|exactly|the (question|prompt|topic)|on[- ]topic)\b|\b(fully|directly|clearly|well) (answers|addresses|covers|aligned|on[- ]topic)\b/i;
// "partial" over a summary that names no gap is a fully on-topic speech when nothing is listed as
// missing, or when the summary itself says it aligns ("aligns well" over "missing: languages").
export const consistentAlignmentStatus = (status: string, summary: string, missingPoints = 0) =>
  status !== 'off-topic' && OFF_TOPIC_SUMMARY.test(summary) ? 'off-topic'
    : status === 'aligned' && GAP_SUMMARY.test(summary) ? 'partial'
    : status === 'partial' && !GAP_SUMMARY.test(summary) && (missingPoints === 0 || ALIGNED_SUMMARY.test(summary)) ? 'aligned'
    : status;

// "um"/"uh" are hesitation sounds with nothing to replace - the fix is always a silent pause.
export const isHesitation = (filler: string) => /^(u+m+|u+h+|e+r+m*|a+h+|h+m+)$/.test(spokenWords(filler));
export const pauseInstead = (filler: string) => `Instead of "${filler}", pause silently for a beat`;

// Share of sentences without a grammar error (an error-heavy sentence still counts once).
export const grammarScoreFor = (errors: number, sentences: number) => Math.max(20, Math.round(100 * (1 - Math.min(errors, sentences) / sentences)));

const WORDS_PER_SENTENCE = 15;
// The Grammar score and its feedback line, from the issues the Grammar card shows.
export const grammarVerdict = (issues: { kind?: string; original: string; corrected: string }[], transcription: string) => {
  const errors = issues.filter(i => i.kind === 'error');
  // Whisper often punctuates a whole speech as one comma-joined "sentence", which made a single
  // mistake score 20 - so count at least one sentence per WORDS_PER_SENTENCE spoken words.
  const words = transcription.split(/\s+/).filter(Boolean).length;
  const punctuated = transcription.split(/[.!?]+(?:\s|$)/).filter(t => t.trim()).length;
  const sentences = Math.max(1, punctuated, Math.round(words / WORDS_PER_SENTENCE));
  const score = grammarScoreFor(errors.length, sentences);
  const examples = errors.slice(0, 3).map(i => `"${i.original}" -> "${i.corrected}"`).join('; ');
  const text = errors.length === 0
    ? `No grammar mistakes found across your ${sentences} sentence${sentences > 1 ? 's' : ''}.`
    : `${errors.length} grammar mistake${errors.length > 1 ? 's' : ''} in ${sentences} sentence${sentences > 1 ? 's' : ''}: ${examples}. Fix ${errors.length > 1 ? 'these' : 'this'} to reach 100 - details in the Grammar section.`;
  return { score, text };
};

// The model invents statistics in advice ("remote workers are 20% more productive") despite the
// prompt - a percentage or money figure the speaker never said becomes a placeholder for theirs.
// ponytail: only % and currency - plain counts ("use 3 points") are usually structural advice.
const STAT = /[$£€]\s?\d+(?:[,.]\d+)*(?:\s?(?:k|m|bn|million|billion)\b)?|\d+(?:[,.]\d+)*\s?(?:%|percent\b)/gi;
export const withoutInventedStats = (text: string, transcription: string) => {
  const said = new Set(transcription.match(/\d+(?:[,.]\d+)*/g) || []);
  return text.replace(STAT, stat => said.has(stat.match(/\d+(?:[,.]\d+)*/)![0]) ? stat : '[your figure]');
};

// A tone rewrite that drops a third of the speaker's words or brings in several new ones says
// something new ("not just a trend" -> "a transformative shift", "really changing" -> "fundamentally
// transforming"), not the same thing in a different tone. Fillers don't count either way.
export const keepsSpeakersWords = (original: string, rewritten: string) => {
  const a = withoutFillers(original).split(' ').filter(Boolean);
  const b = withoutFillers(rewritten).split(' ').filter(Boolean);
  const kept = new Set(b), said = new Set(a);
  const added = b.filter(w => !said.has(w) && !ARTICLES.has(w)).length;
  return a.filter(w => kept.has(w)).length >= (a.length * 2) / 3 && added <= Math.max(2, a.length / 3);
};
