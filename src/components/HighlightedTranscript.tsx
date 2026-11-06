import React from 'react';
import { useSpeech } from '@/context/SpeechContext';
import { Lightbulb } from 'lucide-react';

export type HighlightType =
  | 'filler' | 'pronunciation' | 'repetition' | 'pace' | 'emotional'
  | 'vocabulary' | 'grammar' | 'content' | 'emphasis';

// Pace and repetition come from real per-word audio timing;
// emotional delivery from the tone suggestions, each quoting exact phrases.
const HIGHLIGHT_STYLES: Record<HighlightType, { label: string; className: string; swatch: string }> = {
  filler: { label: 'Filler Word', className: 'bg-red-200 text-red-900', swatch: 'bg-red-200 border-red-300' },
  pronunciation: { label: 'Pronunciation', className: 'bg-orange-200 text-orange-900', swatch: 'bg-orange-200 border-orange-300' },
  repetition: { label: 'Repetition', className: 'bg-blue-200 text-blue-900', swatch: 'bg-blue-200 border-blue-300' },
  pace: { label: 'Pace Issue', className: 'bg-yellow-200 text-yellow-900', swatch: 'bg-yellow-200 border-yellow-300' },
  emotional: { label: 'Emotional Delivery', className: 'bg-pink-200 text-pink-900', swatch: 'bg-pink-200 border-pink-300' },
  vocabulary: { label: 'Vocabulary', className: 'bg-teal-100 text-teal-900', swatch: 'bg-teal-100 border-teal-300' },
  content: { label: 'Content (vague / off-topic)', className: 'bg-slate-200 text-slate-900', swatch: 'bg-slate-200 border-slate-300' },
  grammar: { label: 'Grammar', className: 'underline decoration-wavy decoration-indigo-600 decoration-2 underline-offset-4', swatch: 'bg-white border-indigo-600 border-b-4' },
  emphasis: { label: 'Stress These Words', className: 'font-bold border-b-2 border-dotted border-green-600', swatch: 'bg-white border-green-600 border-dotted border-b-4' },
};

// When highlights overlap, the most specific (shortest) kind wins the
// background color - pace stretches span many words, so they rank low.
// Grammar and emphasis are drawn as underlines so they coexist with any of them.
const BACKGROUND_PRIORITY: HighlightType[] = ['filler', 'pronunciation', 'repetition', 'vocabulary', 'emotional', 'content', 'pace'];
const UNDERLINE_TYPES: HighlightType[] = ['grammar', 'emphasis'];

const LEGEND_ORDER: HighlightType[] = ['filler', 'pronunciation', 'grammar', 'repetition', 'pace', 'emotional', 'vocabulary', 'content', 'emphasis'];

interface Annotation {
  start: number;
  end: number;
  type: HighlightType;
  note: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds every occurrence of `phrase` in `text`, ignoring case and tolerating
// differences in punctuation/spacing between words - the model's quoted
// excerpts don't always reproduce the transcript's commas exactly.
const findPhraseRanges = (text: string, phrase: string): Array<[number, number]> => {
  const tokens = phrase.match(/[\w']+/g);
  if (!tokens || tokens.length === 0) return [];
  const pattern = new RegExp(`(?<![\\w'])${tokens.map(escapeRegExp).join("[^\\w']+")}(?![\\w'])`, 'gi');
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
};

const HighlightedTranscript: React.FC<{ text: string }> = ({ text }) => {
  const { speechData } = useSpeech();

  const annotations: Annotation[] = [];
  const seen = new Set<string>();
  // Legend counts are issues found in the text, not highlighted spots - a weak
  // word said 13 times is still one vocabulary suggestion, matching the cards below.
  const counts = Object.fromEntries(LEGEND_ORDER.map(type => [type, 0])) as Record<HighlightType, number>;
  // `occurrence` pins the highlight to one instance of the phrase (falling back
  // to the first) rather than every place it's said.
  const add = (type: HighlightType, phrase: string | undefined, note: string, occurrence?: number) => {
    if (typeof phrase !== 'string' || !phrase.trim()) return;
    const all = findPhraseRanges(text, phrase);
    if (all.length > 0) counts[type] += 1;
    const ranges = occurrence === undefined || all.length === 0 ? all : [all[occurrence] ?? all[0]];
    for (const [start, end] of ranges) {
      const key = `${type}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      annotations.push({ start, end, type, note });
    }
  };

  // Each filler entry is one spoken instance, in order - so the Nth "you know"
  // flagged is the Nth one in the text, not every "you know".
  const fillersSoFar = new Map<string, number>();
  (speechData?.mistakes || []).forEach(m => {
    // Saved sessions can hold types no longer highlighted (e.g. volume).
    if (!(m.type in HIGHLIGHT_STYLES)) return;
    let nth: number | undefined;
    if (m.type === 'filler') {
      const key = m.text.toLowerCase();
      nth = fillersSoFar.get(key) ?? 0;
      fillersSoFar.set(key, nth + 1);
    }
    add(m.type as HighlightType, m.text, m.suggestion, nth);
  });
  (speechData?.toneSuggestions?.phrases || []).forEach(p => {
    add('emotional', p.original, p.suggestedTone ? `Say it ${p.suggestedTone}: "${p.rewritten}"` : p.reason);
  });
  (speechData?.emphasisSuggestions?.phrases || []).forEach(p => {
    add('emphasis', p.phrase, p.how || p.reason);
  });
  (speechData?.mispronuncedWords || []).forEach(w => {
    const fix = w.correctWord ? `Say "${w.correctWord}"${w.phoneticCorrect ? ` (${w.phoneticCorrect})` : ''}` : '';
    // Azure says which instance it flagged; older reports don't, so mark just the first.
    add('pronunciation', w.word, [fix, w.suggestion].filter(Boolean).join(' - '), w.occurrence ?? 0);
  });
  (speechData?.grammarAnalysis?.issues || []).forEach(i => {
    // The tooltip already prefixes "Grammar:" - the note is just the fix.
    add('grammar', i.original, `${i.kind === 'refinement' ? 'Optional polish - say' : 'Say'} "${i.corrected}"`);
  });
  (speechData?.vocabularyAnalysis?.weaknesses || []).forEach(w => {
    const note = w.alternatives && w.alternatives.length > 0 ? `Try: ${w.alternatives.join(', ')}` : w.suggestion;
    add('vocabulary', w.word, note);
  });
  (speechData?.contentQualityAnalysis?.issues || []).forEach(i => {
    // Immediate repeats are already located from the audio; content-level
    // repetition (the same point made twice) shares the Repetition color.
    add(i.type === 'repetition' ? 'repetition' : 'content', i.excerpt, i.suggestion);
  });

  // Split the text at every highlight boundary, then style each piece by
  // whichever highlights cover it.
  const boundaries = Array.from(new Set([0, text.length, ...annotations.flatMap(a => [a.start, a.end])])).sort((a, b) => a - b);
  const segments: React.ReactNode[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const piece = text.slice(start, end);
    const covering = annotations.filter(a => a.start <= start && a.end >= end);
    if (covering.length === 0) {
      segments.push(piece);
      continue;
    }
    const types = new Set(covering.map(a => a.type));
    const background = BACKGROUND_PRIORITY.find(t => types.has(t));
    const classes = [
      background ? HIGHLIGHT_STYLES[background].className : '',
      ...UNDERLINE_TYPES.filter(t => types.has(t)).map(t => HIGHLIGHT_STYLES[t].className),
      'rounded-sm cursor-help',
    ].join(' ');
    const title = Array.from(new Set(covering.map(a => `${HIGHLIGHT_STYLES[a.type].label}: ${a.note}`))).join('\n');
    segments.push(<span key={start} className={classes} title={title}>{piece}</span>);
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-700 leading-loose text-lg whitespace-pre-wrap">{segments}</p>

      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h5 className="font-bold text-gray-800 mb-1 flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-yellow-600" />
          Issue Types Found
        </h5>
        <p className="text-sm text-gray-500 mb-4">Hover over a highlighted word to see the suggestion.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {LEGEND_ORDER.map(type => (
            <div key={type} className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${counts[type] === 0 ? 'opacity-50' : ''}`}>
              <div className={`w-6 h-6 rounded-lg border-2 shrink-0 ${HIGHLIGHT_STYLES[type].swatch}`}></div>
              <span className="font-medium">{HIGHLIGHT_STYLES[type].label}</span>
              <span className="ml-auto text-sm font-semibold text-gray-600">{counts[type]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HighlightedTranscript;
